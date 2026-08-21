import { createMusicService } from "@ai-music/ai-providers";
import { prisma, Prisma } from "@ai-music/db";
import {
  OPERATION_COST_UNITS,
  parseTimedLyricsCache,
  serializeTimedLyricsCache,
  type TimedLyricsPayload,
  type TimedLyricsResponseDto,
} from "@ai-music/shared";
import { BadRequestError, NotFoundError } from "../../common/errors.js";
import { refundOriginalSpend, spendCredits } from "../credits/service.js";
import { assertFeature } from "../billing/entitlements.service.js";
import {
  resolveTimedLyricsStrategy,
  timedLyricsStrategyErrorCode,
  type TimedLyricsSunoIds,
} from "./timed-lyrics-strategy.js";

const musicService = createMusicService();

type TrackWithGeneration = Prisma.MusicGenerationTrackGetPayload<{
  include: { musicGeneration: true };
}>;

function resolveCachedPayload(track: TrackWithGeneration): TimedLyricsPayload | null {
  return parseTimedLyricsCache(track.timedLyricsJson);
}

function hasWordLevelCache(payload: TimedLyricsPayload | null): boolean {
  return Boolean(payload?.lines.length && payload.words?.length);
}

function hasLineLevelCache(payload: TimedLyricsPayload | null): boolean {
  return Boolean(payload?.lines.length);
}

function toResponseDto(payload: TimedLyricsPayload, cached: boolean): TimedLyricsResponseDto {
  return {
    lines: payload.lines,
    words: payload.words,
    cached,
  };
}

function assertKaraokeEligibleTrack(track: TrackWithGeneration): void {
  if (track.musicGeneration.type !== "song") {
    throw new BadRequestError(
      "Karaoke Sync доступен только для музыкальных треков",
      "TIMED_LYRICS_NOT_SONG",
    );
  }

  if (track.musicGeneration.instrumental) {
    throw new BadRequestError(
      "Для инструментальных треков Karaoke Sync недоступен",
      "TIMED_LYRICS_INSTRUMENTAL",
    );
  }

  if (!track.lyricsText?.trim()) {
    throw new BadRequestError(
      "У трека нет текста для Karaoke Sync",
      "TIMED_LYRICS_NO_LYRICS",
    );
  }
}

/**
 * Resolve Suno timed-lyrics ids from the track that created the audio.
 * Must run before credit spend. Does not use active/default MusicProvider.
 */
function requireTimedLyricsSunoIds(track: TrackWithGeneration): TimedLyricsSunoIds {
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: track.musicGeneration.provider,
    providerTaskId: track.musicGeneration.providerTaskId,
    providerAudioId: track.providerTrackId,
  });

  if (strategy.kind === "unavailable") {
    const code = timedLyricsStrategyErrorCode(strategy);
    const message =
      code === "TIMED_LYRICS_UNAVAILABLE_FOR_PROVIDER"
        ? "Karaoke Sync недоступен для этого трека"
        : code === "MUSIC_PROVIDER_AFFINITY_MISMATCH" ||
            code === "MUSIC_PROVIDER_AFFINITY_UNKNOWN"
          ? "Karaoke Sync недоступен: конфликт данных провайдера трека"
          : "Недостаточно данных провайдера для Karaoke Sync";
    throw new BadRequestError(message, code);
  }

  return {
    sunoTaskId: strategy.sunoTaskId,
    sunoAudioId: strategy.sunoAudioId,
  };
}

async function loadTrackForUser(userId: string, trackId: string): Promise<TrackWithGeneration> {
  const track = await prisma.musicGenerationTrack.findUnique({
    where: { id: trackId },
    include: { musicGeneration: true },
  });

  if (!track || track.musicGeneration.userId !== userId) {
    throw new NotFoundError("Track not found");
  }

  return track;
}

async function fetchAndPersistTimedLyrics(
  track: TrackWithGeneration,
  sunoIds: { sunoTaskId: string; sunoAudioId: string },
): Promise<TimedLyricsPayload> {
  const result = await musicService.getTimestampedLyrics({
    taskId: sunoIds.sunoTaskId,
    audioId: sunoIds.sunoAudioId,
  });

  const payload: TimedLyricsPayload = {
    lines: result.lines,
    words: result.words,
  };

  await prisma.musicGenerationTrack.update({
    where: { id: track.id },
    data: {
      timedLyricsJson: serializeTimedLyricsCache(payload) as unknown as Prisma.InputJsonValue,
    },
  });

  return payload;
}

export async function getTimedLyricsForTrack(
  userId: string,
  trackId: string,
): Promise<TimedLyricsResponseDto> {
  const track = await loadTrackForUser(userId, trackId);
  assertKaraokeEligibleTrack(track);

  const payload = resolveCachedPayload(track);

  if (!hasLineLevelCache(payload) || !payload) {
    throw new NotFoundError("Timed lyrics not cached for this track");
  }

  return toResponseDto(payload, true);
}

export async function fetchTimedLyricsForTrack(
  userId: string,
  trackId: string,
): Promise<TimedLyricsResponseDto> {
  await assertFeature(userId, "karaokeSync");

  const track = await loadTrackForUser(userId, trackId);
  assertKaraokeEligibleTrack(track);

  const cachedPayload = resolveCachedPayload(track);

  if (hasWordLevelCache(cachedPayload) && cachedPayload) {
    return toResponseDto(cachedPayload, true);
  }

  // Fail closed on provider/capability/ids before any spend.
  const sunoIds = requireTimedLyricsSunoIds(track);

  const isWordUpgrade = hasLineLevelCache(cachedPayload);
  const spendKey = `karaoke_lyrics:${trackId}:spend`;

  if (!isWordUpgrade) {
    await spendCredits({
      userId,
      amountUnits: OPERATION_COST_UNITS.karaokeLyrics,
      reason: "karaoke_lyrics",
      idempotencyKey: spendKey,
      relatedEntityType: "music_generation_track",
      relatedEntityId: trackId,
    });
  }

  try {
    const freshTrack = await prisma.musicGenerationTrack.findUnique({
      where: { id: trackId },
      include: { musicGeneration: true },
    });

    const freshPayload = freshTrack ? resolveCachedPayload(freshTrack) : null;

    if (hasWordLevelCache(freshPayload) && freshPayload) {
      if (!isWordUpgrade) {
        await refundOriginalSpend({
          userId,
          spendIdempotencyKey: spendKey,
          refundIdempotencyKey: `karaoke_lyrics:${trackId}:refund:duplicate`,
          reason: "karaoke_lyrics_duplicate",
          relatedEntityType: "music_generation_track",
          relatedEntityId: trackId,
        }).catch(() => undefined);
      }

      return toResponseDto(freshPayload, true);
    }

    const trackForFetch = freshTrack ?? track;
    const payload = await fetchAndPersistTimedLyrics(trackForFetch, sunoIds);

    return toResponseDto(payload, isWordUpgrade);
  } catch (error) {
    if (!isWordUpgrade) {
      await refundOriginalSpend({
        userId,
        spendIdempotencyKey: spendKey,
        refundIdempotencyKey: `karaoke_lyrics:${trackId}:refund`,
        reason: "karaoke_lyrics_failed",
        relatedEntityType: "music_generation_track",
        relatedEntityId: trackId,
      }).catch(() => undefined);
    }

    throw error;
  }
}

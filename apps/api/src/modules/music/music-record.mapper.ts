import type {
  MusicGenerationPhaseHint,
  MusicGenerationRecordDto,
  MusicGenerationRecordStatus,
  MusicGenerationTrackDto,
  MusicQueuePhase,
  MusicStatusResponseDto,
  MusicTrackPersistenceState,
} from "@ai-music/shared";
import {
  isMusicTrackPlaybackAvailable,
  parseAlbumCoverImagesJson,
  resolveMusicTrackAudioPersistence,
  resolveMusicTrackAudioStatus,
} from "@ai-music/shared";
import type {
  GenerationStatusResult,
  GeneratedLyrics,
} from "@ai-music/ai-providers";
import type { MusicGeneration, MusicGenerationTrack } from "@ai-music/db";
import { resolveMusicGenerationErrorDisplay } from "./music-provider-error-display.js";
import { resolveMusicGenerationPhaseHint } from "./music-queue-meta.js";

type MusicGenerationWithTracks = MusicGeneration & {
  tracks: MusicGenerationTrack[];
};

export interface MusicTrackPlaybackContext {
  storageBucketsByKey?: Map<string, string>;
  configuredStorageBucket?: string | null;
}

function resolveTrackPlaybackFields(
  track: Pick<
    MusicGenerationTrack,
    "persistenceState" | "audioStorageKey" | "persistenceErrorCode"
  >,
  playback?: MusicTrackPlaybackContext,
) {
  const key = track.audioStorageKey?.trim() ?? "";
  const storageObjectBucket = key
    ? (playback?.storageBucketsByKey?.get(key) ?? null)
    : null;

  const input = {
    persistenceState: track.persistenceState,
    audioStorageKey: track.audioStorageKey,
    persistenceErrorCode: track.persistenceErrorCode,
    storageObjectBucket,
    configuredStorageBucket: playback?.configuredStorageBucket ?? null,
  };

  return {
    playbackAvailable: isMusicTrackPlaybackAvailable(input),
    audioStatus: resolveMusicTrackAudioStatus(input),
  };
}

export function toMusicGenerationRecordDto(
  record: MusicGenerationWithTracks,
  apiBaseUrl: string,
  playback?: MusicTrackPlaybackContext,
): MusicGenerationRecordDto {
  const errorDisplay = resolveMusicGenerationErrorDisplay(
    record.rawStatus,
    record.errorMessage,
  );

  return {
    id: record.id,
    type: record.type as MusicGenerationRecordDto["type"],
    provider: record.provider,
    providerTaskId: record.providerTaskId,
    prompt: record.prompt,
    style: record.style,
    title: record.title,
    customMode: record.customMode,
    instrumental: record.instrumental,
    status: record.status as MusicGenerationRecordStatus,
    rawStatus: errorDisplay.rawStatus,
    errorMessage: errorDisplay.errorMessage,
    lyrics: parseLyricsResult(record.lyricsResult),
    tracks: record.tracks.map((track) =>
      toMusicTrackDto(record, track, apiBaseUrl, playback),
    ),
    albumCoverImages: parseAlbumCoverImagesJson(record.albumCoverImagesJson) ?? [],
    selectedAlbumCoverUrl: record.selectedAlbumCoverUrl,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toMusicStatusResponse(
  status: GenerationStatusResult,
  record: MusicGenerationWithTracks | null,
  apiBaseUrl: string,
  queueMeta?: { queuePhase?: MusicQueuePhase; queueEtaSec?: number },
  playback?: MusicTrackPlaybackContext,
): MusicStatusResponseDto {
  const errorDisplay = resolveMusicGenerationErrorDisplay(
    status.rawStatus,
    status.errorMessage,
  );

  const persistenceTracks =
    record?.tracks.map((track) => ({
      persistenceState: track.persistenceState as MusicTrackPersistenceState,
    })) ?? [];

  const recordStatus =
    (record?.status as MusicGenerationRecordStatus | undefined) ?? status.status;

  const audioPersistence = resolveMusicTrackAudioPersistence(
    recordStatus,
    persistenceTracks,
  );

  const tracks = resolveStatusTracks(status, record, apiBaseUrl, playback);
  const hasStreamProgress = Boolean(
    tracks?.some((track) => Boolean(track.audioUrl)) ||
      status.tracks?.some(
        (track) => Boolean(track.audioUrl) || Boolean(track.streamAudioUrl),
      ),
  );

  const phaseHint: MusicGenerationPhaseHint | undefined = resolveMusicGenerationPhaseHint({
    status: recordStatus,
    queuePhase: queueMeta?.queuePhase,
    audioPersistence,
    hasStreamProgress,
  });

  return {
    recordId: record?.id ?? null,
    taskId: status.taskId,
    status: status.status,
    provider: record?.provider ?? status.provider,
    rawStatus: errorDisplay.rawStatus ?? undefined,
    queuePhase: queueMeta?.queuePhase,
    queueEtaSec: queueMeta?.queueEtaSec,
    phaseHint,
    audioPersistence,
    tracks,
    lyrics: status.lyrics,
    errorMessage: errorDisplay.errorMessage ?? undefined,
    albumCoverImages: parseAlbumCoverImagesJson(record?.albumCoverImagesJson) ?? [],
    selectedAlbumCoverUrl: record?.selectedAlbumCoverUrl ?? null,
  };
}

function resolveStatusTracks(
  status: GenerationStatusResult,
  record: MusicGenerationWithTracks | null,
  apiBaseUrl: string,
  playback?: MusicTrackPlaybackContext,
): MusicStatusResponseDto["tracks"] {
  if (record?.tracks.length) {
    return record.tracks.map((track) => {
      const { playbackAvailable, audioStatus } = resolveTrackPlaybackFields(
        track,
        playback,
      );

      return {
        id: track.id,
        providerTrackId: track.providerTrackId,
        canDelete: true,
        title: track.title,
        audioUrl: playbackAvailable
          ? `${apiBaseUrl}/api/music/tracks/${track.id}/audio`
          : "",
        imageUrl: record.selectedAlbumCoverUrl ?? track.imageSourceUrl ?? undefined,
        durationSec: track.durationSec ?? undefined,
        lyricsText: track.lyricsText ?? undefined,
        persistenceState: track.persistenceState as MusicTrackPersistenceState,
        playbackAvailable,
        audioStatus,
      };
    });
  }

  return status.tracks?.map((track) => {
    const stored = record?.tracks.find((item) => item.providerTrackId === track.id);
    const playbackFields = stored
      ? resolveTrackPlaybackFields(stored, playback)
      : { playbackAvailable: false, audioStatus: "processing" as const };

    return {
      id: stored?.id ?? track.id,
      providerTrackId: track.id,
      canDelete: Boolean(stored?.id),
      title: track.title,
      audioUrl:
        playbackFields.playbackAvailable && stored
          ? `${apiBaseUrl}/api/music/tracks/${stored.id}/audio`
          : "",
      imageUrl: record?.selectedAlbumCoverUrl ?? track.imageUrl,
      durationSec: track.durationSec,
      lyricsText: track.lyricsText,
      persistenceState: stored?.persistenceState as MusicTrackPersistenceState | undefined,
      playbackAvailable: playbackFields.playbackAvailable,
      audioStatus: playbackFields.audioStatus,
    };
  });
}

function toMusicTrackDto(
  record: MusicGenerationWithTracks,
  track: MusicGenerationTrack,
  apiBaseUrl: string,
  playback?: MusicTrackPlaybackContext,
): MusicGenerationTrackDto {
  const imageUrl = record.selectedAlbumCoverUrl ?? track.imageSourceUrl;
  const { playbackAvailable, audioStatus } = resolveTrackPlaybackFields(track, playback);

  return {
    id: track.id,
    providerTrackId: track.providerTrackId,
    title: track.title,
    durationSec: track.durationSec,
    audioUrl: playbackAvailable
      ? `${apiBaseUrl}/api/music/tracks/${track.id}/audio`
      : null,
    imageUrl,
    lyricsText: track.lyricsText,
    persistenceState: track.persistenceState as MusicTrackPersistenceState,
    playbackAvailable,
    audioStatus,
  };
}

function parseLyricsResult(
  value: unknown,
): Array<{ title: string; text: string }> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .filter(
      (item): item is GeneratedLyrics =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as GeneratedLyrics).title === "string" &&
        typeof (item as GeneratedLyrics).text === "string",
    )
    .map((item) => ({ title: item.title, text: item.text }));
}

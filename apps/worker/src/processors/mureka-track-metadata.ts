import type { GeneratedTrack } from "@ai-music/ai-providers";
import { Prisma, prisma } from "@ai-music/db";
import { enqueueMusicTrackPersistJob } from "../music-track-persistence-queue.js";

export async function upsertMurekaTracksAndEnqueue(
  record: { id: string; userId: string },
  tracks: GeneratedTrack[],
): Promise<void> {
  const rows = await Promise.all(
    tracks.map((track) =>
      prisma.musicGenerationTrack.upsert({
        where: {
          musicGenerationId_providerTrackId: {
            musicGenerationId: record.id,
            providerTrackId: track.id,
          },
        },
        create: buildTrackData(record.id, track),
        update: buildTrackUpdate(track),
      }),
    ),
  );

  await Promise.all(
    rows.map((row) =>
      enqueueMusicTrackPersistJob({
        trackId: row.id,
        musicGenerationId: record.id,
        userId: record.userId,
      }),
    ),
  );
}

function buildTrackData(musicGenerationId: string, track: GeneratedTrack) {
  return {
    musicGenerationId,
    providerTrackId: track.id,
    title: track.title,
    durationSec: track.durationSec ?? null,
    audioSourceUrl: track.audioUrl,
    imageSourceUrl: track.imageUrl ?? null,
    lyricsText: track.lyricsText ?? null,
    timedLyricsJson: toJson(track.timedLyrics),
    persistenceState: "pending" as const,
  };
}

function buildTrackUpdate(track: GeneratedTrack) {
  return {
    title: track.title,
    durationSec: track.durationSec ?? null,
    audioSourceUrl: track.audioUrl,
    imageSourceUrl: track.imageUrl ?? null,
    lyricsText: track.lyricsText ?? null,
    timedLyricsJson: toJson(track.timedLyrics),
    persistenceState: "pending" as const,
    persistenceErrorCode: null,
    persistenceErrorMessage: null,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

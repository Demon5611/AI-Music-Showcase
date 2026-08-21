import type { GeneratedTrack } from "@ai-music/ai-providers";
import { prisma } from "@ai-music/db";
import { observeCallbackPhase, type CallbackPhase } from "@ai-music/observability";
import { logLoadControl } from "@ai-music/shared";
import { enqueueMusicTrackPersistJob } from "../queue/music-track-persistence-queue.js";
import type { TransitionResult } from "./music-generation-transition.js";

type ExistingTrackRow = {
  id: string;
  providerTrackId: string;
  title: string | null;
  durationSec: number | null;
  audioSourceUrl: string | null;
  imageSourceUrl: string | null;
  lyricsText: string | null;
  audioStorageKey: string | null;
  persistenceState: string;
};

export type UpsertTracksOptions = {
  /** When noop/conflict, unchanged pending|processing|stored tracks may skip work. */
  transition?: TransitionResult;
};

/**
 * Skip only on duplicate/noop transitions when the track is already in a
 * recoverable persistence state and provider metadata did not change.
 * Never skip: new tracks, failed (retryable), or changed provider URL/metadata.
 */
export function shouldSkipTrackOnDuplicateCallback(
  transition: TransitionResult | undefined,
  existing: ExistingTrackRow | null | undefined,
  providerTrack: GeneratedTrack,
  sourceUrl: string | undefined,
): boolean {
  if (transition !== "noop" && transition !== "conflict") {
    return false;
  }

  if (!existing) {
    return false;
  }

  if (
    existing.persistenceState !== "pending" &&
    existing.persistenceState !== "processing" &&
    existing.persistenceState !== "stored"
  ) {
    return false;
  }

  return isTrackMetadataUnchanged(existing, providerTrack, sourceUrl);
}

export function isTrackMetadataUnchanged(
  existing: Pick<
    ExistingTrackRow,
    "title" | "durationSec" | "audioSourceUrl" | "imageSourceUrl" | "lyricsText"
  >,
  providerTrack: GeneratedTrack,
  sourceUrl: string | undefined,
): boolean {
  const nextUrl = sourceUrl || null;
  const nextImage = providerTrack.imageUrl ?? null;
  const nextLyrics = providerTrack.lyricsText ?? null;
  const nextDuration = providerTrack.durationSec ?? null;
  const nextTitle = providerTrack.title ?? null;

  return (
    (existing.audioSourceUrl ?? null) === nextUrl &&
    (existing.title ?? null) === nextTitle &&
    (existing.imageSourceUrl ?? null) === nextImage &&
    (existing.lyricsText ?? null) === nextLyrics &&
    (existing.durationSec ?? null) === nextDuration
  );
}

function logPhase(
  phase: CallbackPhase,
  startedAtMs: number,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  observeCallbackPhase(phase, startedAtMs);
  logLoadControl("suno_callback_sync", {
    phase,
    durationMs: Date.now() - startedAtMs,
    ...fields,
  });
}

/**
 * Upsert track metadata only and enqueue async R2 persistence.
 * Never downloads provider audio on the request path.
 * Independent tracks run in parallel (Promise.all).
 */
export async function upsertTracksAndEnqueuePersistence(
  record: { id: string; userId: string },
  providerTracks: GeneratedTrack[],
  options: UpsertTracksOptions = {},
): Promise<{ upserted: number; enqueued: number; skipped: number }> {
  const validTracks = providerTracks.filter((track) => Boolean(track.id));
  if (validTracks.length === 0) {
    return { upserted: 0, enqueued: 0, skipped: 0 };
  }

  const existingRows = await prisma.musicGenerationTrack.findMany({
    where: {
      musicGenerationId: record.id,
      providerTrackId: { in: validTracks.map((track) => track.id) },
    },
    select: {
      id: true,
      providerTrackId: true,
      title: true,
      durationSec: true,
      audioSourceUrl: true,
      imageSourceUrl: true,
      lyricsText: true,
      audioStorageKey: true,
      persistenceState: true,
    },
  });
  const existingByProviderId = new Map(
    existingRows.map((row) => [row.providerTrackId, row] as const),
  );

  type Prepared = {
    providerTrack: GeneratedTrack;
    sourceUrl: string | undefined;
    existing: ExistingTrackRow | undefined;
    skip: boolean;
  };

  const prepared: Prepared[] = validTracks.map((providerTrack) => {
    const sourceUrl = providerTrack.audioUrl || providerTrack.streamAudioUrl;
    const existing = existingByProviderId.get(providerTrack.id);
    return {
      providerTrack,
      sourceUrl,
      existing,
      skip: shouldSkipTrackOnDuplicateCallback(
        options.transition,
        existing,
        providerTrack,
        sourceUrl,
      ),
    };
  });

  const toUpsert = prepared.filter((item) => !item.skip);
  const skipped = prepared.length - toUpsert.length;

  const upsertStarted = Date.now();
  const upsertedRows = await Promise.all(
    toUpsert.map(async ({ providerTrack, sourceUrl, existing }) => {
      const row = await prisma.musicGenerationTrack.upsert({
        where: {
          musicGenerationId_providerTrackId: {
            musicGenerationId: record.id,
            providerTrackId: providerTrack.id,
          },
        },
        create: {
          musicGenerationId: record.id,
          providerTrackId: providerTrack.id,
          title: providerTrack.title,
          durationSec: providerTrack.durationSec ?? null,
          audioSourceUrl: sourceUrl || null,
          imageSourceUrl: providerTrack.imageUrl ?? null,
          lyricsText: providerTrack.lyricsText ?? null,
          persistenceState: sourceUrl ? "pending" : "failed",
          persistenceErrorCode: sourceUrl ? null : "MISSING_SOURCE",
          persistenceErrorMessage: sourceUrl ? null : "No audio URL from provider",
        },
        update: {
          title: providerTrack.title,
          durationSec: providerTrack.durationSec ?? null,
          audioSourceUrl: sourceUrl || undefined,
          imageSourceUrl: providerTrack.imageUrl ?? null,
          lyricsText: providerTrack.lyricsText ?? null,
          ...(existing?.audioStorageKey
            ? {}
            : sourceUrl
              ? {
                  persistenceState:
                    existing?.persistenceState === "processing"
                      ? "processing"
                      : ("pending" as const),
                  persistenceErrorCode: null,
                  persistenceErrorMessage: null,
                }
              : {}),
        },
      });

      return row;
    }),
  );
  logPhase("track_metadata_upsert", upsertStarted, {
    recordId: record.id,
    upserted: upsertedRows.length,
    skipped,
  });

  const needsEnqueue = upsertedRows.filter(
    (row) => !row.audioStorageKey && row.persistenceState !== "stored" && Boolean(row.audioSourceUrl),
  );

  const enqueueStarted = Date.now();
  const enqueueOutcomes = await Promise.all(
    needsEnqueue.map(async (row) => {
      const trackEnqueueStarted = Date.now();
      try {
        const outcome = await enqueueMusicTrackPersistJob({
          trackId: row.id,
          musicGenerationId: record.id,
          userId: record.userId,
        });
        logLoadControl("music_track_persist_enqueue", {
          phase: "persistence_enqueue",
          durationMs: Date.now() - trackEnqueueStarted,
          trackId: row.id,
          recordId: record.id,
          outcome,
        });
        return outcome;
      } catch (error) {
        // Leave pending for reconciler — do not fail callback/status.
        logLoadControl(
          "music_track_persist_enqueue",
          {
            phase: "persistence_enqueue",
            durationMs: Date.now() - trackEnqueueStarted,
            trackId: row.id,
            recordId: record.id,
            error: error instanceof Error ? error.message : "enqueue_failed",
          },
          "warn",
        );
        return null;
      }
    }),
  );
  const enqueued = enqueueOutcomes.filter((outcome) => outcome === "enqueued").length;
  logPhase("persistence_enqueue", enqueueStarted, {
    recordId: record.id,
    enqueued,
    attempted: needsEnqueue.length,
    skipped,
  });

  return { upserted: upsertedRows.length, enqueued, skipped };
}

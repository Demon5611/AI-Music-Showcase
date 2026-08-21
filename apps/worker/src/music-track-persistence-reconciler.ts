import { prisma } from "@ai-music/db";
import {
  logLoadControl,
  MUSIC_TRACK_PERSIST_STALE_MS_DEFAULT,
} from "@ai-music/shared";
import { getWorkerEnv } from "./config/env.js";
import { enqueueMusicTrackPersistJob } from "./music-track-persistence-queue.js";

export function startMusicTrackPersistenceReconciler(): NodeJS.Timeout | null {
  const env = getWorkerEnv();

  if (!env.WORKER_TRACK_PERSIST_RECONCILER_ENABLED) {
    return null;
  }

  void reconcilePendingMusicTracks().catch((error) => {
    logLoadControl(
      "music_track_persist_reconcile",
      {
        outcome: "skip",
        reason: "tick_failed",
        error: error instanceof Error ? error.message : "unknown",
      },
      "warn",
    );
  });

  return setInterval(() => {
    void reconcilePendingMusicTracks().catch((error) => {
      logLoadControl(
        "music_track_persist_reconcile",
        {
          outcome: "skip",
          reason: "tick_failed",
          error: error instanceof Error ? error.message : "unknown",
        },
        "warn",
      );
    });
  }, env.WORKER_TRACK_PERSIST_RECONCILER_INTERVAL_MS);
}

export async function reconcilePendingMusicTracks(): Promise<void> {
  const env = getWorkerEnv();
  const staleMs = Number(
    process.env.MUSIC_TRACK_PERSIST_STALE_MS ?? MUSIC_TRACK_PERSIST_STALE_MS_DEFAULT,
  );
  const staleBefore = new Date(Date.now() - staleMs);

  const tracks = await prisma.musicGenerationTrack.findMany({
    where: {
      audioStorageKey: null,
      audioSourceUrl: { not: null },
      OR: [
        { persistenceState: "pending" },
        {
          persistenceState: "processing",
          OR: [
            { persistenceHeartbeatAt: null },
            { persistenceHeartbeatAt: { lt: staleBefore } },
          ],
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: env.WORKER_TRACK_PERSIST_RECONCILER_BATCH,
    select: {
      id: true,
      musicGenerationId: true,
      musicGeneration: { select: { userId: true } },
      persistenceState: true,
    },
  });

  for (const track of tracks) {
    try {
      await enqueueMusicTrackPersistJob({
        trackId: track.id,
        musicGenerationId: track.musicGenerationId,
        userId: track.musicGeneration.userId,
      });
    } catch (error) {
      logLoadControl(
        "music_track_persist_reconcile",
        {
          outcome: "skip",
          reason: "enqueue_failed",
          trackId: track.id,
          error: error instanceof Error ? error.message : "unknown",
        },
        "error",
      );
    }
  }
}

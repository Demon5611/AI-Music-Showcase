import { Queue } from "bullmq";
import {
  logLoadControl,
  MUSIC_TRACK_PERSIST_ATTEMPTS_DEFAULT,
  MUSIC_TRACK_PERSIST_BACKOFF_MS_DEFAULT,
  MUSIC_TRACK_PERSIST_JOB_NAME,
  MUSIC_TRACK_PERSISTENCE_QUEUE_NAME,
  musicTrackPersistJobId,
  type MusicTrackPersistJobPayload,
} from "@ai-music/shared";

let queue: Queue<MusicTrackPersistJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function getMusicTrackPersistenceQueue(): Queue<MusicTrackPersistJobPayload> {
  if (!queue) {
    queue = new Queue<MusicTrackPersistJobPayload>(MUSIC_TRACK_PERSISTENCE_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }

  return queue;
}

export type PersistEnqueueOutcome = "enqueued" | "already_queued" | "skipped_finished";

export async function enqueueMusicTrackPersistJob(
  payload: MusicTrackPersistJobPayload,
): Promise<PersistEnqueueOutcome> {
  const jobId = musicTrackPersistJobId(payload.trackId);
  const queueRef = getMusicTrackPersistenceQueue();
  const attempts = Number(process.env.MUSIC_TRACK_PERSIST_ATTEMPTS ?? MUSIC_TRACK_PERSIST_ATTEMPTS_DEFAULT);
  const backoff = Number(
    process.env.MUSIC_TRACK_PERSIST_BACKOFF_MS ?? MUSIC_TRACK_PERSIST_BACKOFF_MS_DEFAULT,
  );

  const existing = await queueRef.getJob(jobId);

  if (existing) {
    const state = await existing.getState();

    if (state === "waiting" || state === "active" || state === "delayed" || state === "prioritized") {
      logLoadControl("music_track_persist_reconcile", {
        outcome: "skip",
        reason: "already_queued",
        trackId: payload.trackId,
      });
      return "already_queued";
    }

    if (state === "completed" || state === "failed") {
      await existing.remove().catch(() => undefined);
    }
  }

  await queueRef.add(MUSIC_TRACK_PERSIST_JOB_NAME, payload, {
    jobId,
    attempts,
    backoff: { type: "exponential", delay: backoff },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });

  logLoadControl("music_track_persist_reconcile", {
    outcome: "enqueued",
    trackId: payload.trackId,
    musicGenerationId: payload.musicGenerationId,
  });

  return "enqueued";
}

export async function closeMusicTrackPersistenceQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

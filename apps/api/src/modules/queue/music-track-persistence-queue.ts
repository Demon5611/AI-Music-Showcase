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
    queue.on("error", (error) => {
      logLoadControl(
        "music_track_persist_enqueue",
        {
          phase: "persistence_enqueue",
          outcome: "queue_error",
          error: error instanceof Error ? error.message : "queue_error",
        },
        "error",
      );
    });
  }

  return queue;
}

/**
 * Callback hot-path outcome after queue.add().
 * BullMQ 5 treats duplicate jobId as idempotent (no second job, no throw).
 * Always `enqueued` after a successful add() — the deterministic id is present.
 */
export type PersistEnqueueOutcome = "enqueued";

/**
 * Deterministic enqueue: one Redis round-trip via add().
 * No preliminary getJob/getState. Duplicate jobId is a normal idempotent success.
 * Replacing finished jobs is the reconciler's responsibility.
 */
export async function enqueueMusicTrackPersistJob(
  payload: MusicTrackPersistJobPayload,
): Promise<PersistEnqueueOutcome> {
  const jobId = musicTrackPersistJobId(payload.trackId);
  const queueRef = getMusicTrackPersistenceQueue();
  const attempts = Number(process.env.MUSIC_TRACK_PERSIST_ATTEMPTS ?? MUSIC_TRACK_PERSIST_ATTEMPTS_DEFAULT);
  const backoff = Number(
    process.env.MUSIC_TRACK_PERSIST_BACKOFF_MS ?? MUSIC_TRACK_PERSIST_BACKOFF_MS_DEFAULT,
  );

  await queueRef.add(MUSIC_TRACK_PERSIST_JOB_NAME, payload, {
    jobId,
    attempts,
    backoff: { type: "exponential", delay: backoff },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });

  logLoadControl("music_track_persist_enqueue", {
    phase: "persistence_enqueue",
    outcome: "enqueued",
    trackId: payload.trackId,
    musicGenerationId: payload.musicGenerationId,
    jobId,
  });

  // BullMQ may have returned an existing job for this id; that is still success.
  return "enqueued";
}

export async function closeMusicTrackPersistenceQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

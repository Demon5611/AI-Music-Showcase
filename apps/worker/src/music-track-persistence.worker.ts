import { Worker, type Job } from "bullmq";
import {
  logLoadControl,
  MUSIC_TRACK_PERSISTENCE_QUEUE_NAME,
  type MusicTrackPersistJobPayload,
} from "@ai-music/shared";
import { processPersistMusicTrack } from "./processors/persist-music-track.js";

let worker: Worker<MusicTrackPersistJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function createMusicTrackPersistenceWorker(): Worker<MusicTrackPersistJobPayload> {
  const concurrency = Number(process.env.WORKER_TRACK_PERSIST_CONCURRENCY ?? 4);

  worker = new Worker<MusicTrackPersistJobPayload>(
    MUSIC_TRACK_PERSISTENCE_QUEUE_NAME,
    async (job: Job<MusicTrackPersistJobPayload>) => {
      const started = Date.now();
      logLoadControl("music_track_persist", {
        phase: "job_start",
        trackId: job.data.trackId,
        attempt: job.attemptsMade + 1,
      });
      await processPersistMusicTrack(job.data);
      logLoadControl("music_track_persist", {
        phase: "job_done",
        trackId: job.data.trackId,
        durationMs: Date.now() - started,
      });
    },
    {
      connection: getRedisConnection(),
      concurrency,
    },
  );

  return worker;
}

export async function closeMusicTrackPersistenceWorker(
  instance?: Worker<MusicTrackPersistJobPayload>,
): Promise<void> {
  const target = instance ?? worker;
  if (target) {
    await target.close();
  }
  if (!instance || instance === worker) {
    worker = null;
  }
}

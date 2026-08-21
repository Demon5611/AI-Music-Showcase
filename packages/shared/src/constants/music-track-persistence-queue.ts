import { createBullMqJobId } from "./bullmq-job-id.js";

export const MUSIC_TRACK_PERSISTENCE_QUEUE_NAME = "music-track-persistence";

export const MUSIC_TRACK_PERSIST_JOB_NAME = "persist-music-track";

/** BullMQ custom jobId — no colon separators. */
export function musicTrackPersistJobId(trackId: string): string {
  return createBullMqJobId("music-track-persist", trackId);
}

export type MusicTrackPersistJobPayload = {
  trackId: string;
  musicGenerationId: string;
  userId: string;
};

export const MUSIC_TRACK_DOWNLOAD_TIMEOUT_MS_DEFAULT = 15_000;
export const MUSIC_TRACK_MAX_BYTES_DEFAULT = 30_000_000;
export const MUSIC_TRACK_PERSIST_ATTEMPTS_DEFAULT = 5;
export const MUSIC_TRACK_PERSIST_BACKOFF_MS_DEFAULT = 5_000;
export const MUSIC_TRACK_PERSIST_HEARTBEAT_MS_DEFAULT = 8_000;
export const MUSIC_TRACK_PERSIST_STALE_MS_DEFAULT = 120_000;
export const MUSIC_TRACK_PROVIDER_404_GRACE_MS_DEFAULT = 180_000;

import type {
  MusicTrackAudioStatus,
  MusicTrackPersistenceState,
} from "../types/music-generation.js";

const STORAGE_MISSING_CODE = "STORAGE_MISSING";

export function resolveMusicTrackAudioStatus(input: {
  persistenceState: MusicTrackPersistenceState | string | null | undefined;
  audioStorageKey: string | null | undefined;
  persistenceErrorCode?: string | null;
  /** Bucket recorded in storage_objects for this key (if known). */
  storageObjectBucket?: string | null;
  /** Current API/worker configured bucket (R2_BUCKET_NAME). */
  configuredStorageBucket?: string | null;
}): MusicTrackAudioStatus {
  const key = input.audioStorageKey?.trim() ?? "";
  const errorCode = input.persistenceErrorCode?.trim().toUpperCase() ?? "";
  const state = (input.persistenceState ?? "").trim().toLowerCase();

  if (errorCode === STORAGE_MISSING_CODE) {
    return "missing";
  }

  if (state === "failed") {
    return "failed";
  }

  if (state === "pending" || state === "processing") {
    return "processing";
  }

  const configured = input.configuredStorageBucket?.trim() ?? "";
  const objectBucket = input.storageObjectBucket?.trim() ?? "";

  // Legacy staging rows can point at another R2 bucket than the live config.
  if (configured && objectBucket && configured !== objectBucket) {
    return "missing";
  }

  if (state === "stored" && key) {
    return "stored";
  }

  if (!key) {
    return "none";
  }

  return "processing";
}

export function isMusicTrackPlaybackAvailable(input: {
  persistenceState: MusicTrackPersistenceState | string | null | undefined;
  audioStorageKey: string | null | undefined;
  persistenceErrorCode?: string | null;
  storageObjectBucket?: string | null;
  configuredStorageBucket?: string | null;
}): boolean {
  return resolveMusicTrackAudioStatus(input) === "stored";
}

export const MUSIC_TRACK_STORAGE_MISSING_CODE = STORAGE_MISSING_CODE;

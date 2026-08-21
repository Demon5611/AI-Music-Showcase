import {
  isStorageBucketNotFoundError,
  isStorageForbiddenError,
  isStorageNotFoundError,
  isStorageTransientError,
} from "@ai-music/storage";

/** Stable, low-cardinality code for logs and metrics. Never includes keys or secrets. */
export function storageErrorCode(error: unknown): string {
  if (isStorageBucketNotFoundError(error)) {
    return "STORAGE_BUCKET_NOT_FOUND";
  }

  if (isStorageForbiddenError(error)) {
    return "STORAGE_FORBIDDEN";
  }

  if (isStorageNotFoundError(error)) {
    return "STORAGE_NOT_FOUND";
  }

  if (isStorageTransientError(error)) {
    return "STORAGE_UNAVAILABLE";
  }

  return "STORAGE_ERROR";
}

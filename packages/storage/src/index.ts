import { createLocalObjectStorage } from "./local-object-storage.js";
import { createR2ObjectStorage } from "./r2-object-storage.js";
import { resolveLocalStoragePath } from "./resolve-local-storage-path.js";
import type { CreateObjectStorageOptions, ObjectStorage } from "./types.js";

export function createObjectStorage(options: CreateObjectStorageOptions): ObjectStorage {
  if (options.driver === "r2") {
    if (!options.r2) {
      throw new Error("R2 configuration is required when STORAGE_DRIVER=r2");
    }

    return createR2ObjectStorage({
      ...options.r2,
      onObjectStored: options.onObjectStored,
    });
  }

  return createLocalObjectStorage({
    localPath: resolveLocalStoragePath(options.localPath),
    onObjectStored: options.onObjectStored,
  });
}

export { resolveLocalStoragePath } from "./resolve-local-storage-path.js";
export {
  StorageBucketNotFoundError,
  StorageForbiddenError,
  StorageNotFoundError,
  StorageTransientError,
  StorageUnavailableError,
  isStorageBucketNotFoundError,
  isStorageConfigError,
  isStorageForbiddenError,
  isStorageNotFoundError,
  isStorageTransientError,
} from "./errors.js";
export { describeStorageConfig, fingerprintValue } from "./config-fingerprint.js";
export { mapR2Error } from "./map-r2-error.js";

export type { StorageConfigDescription } from "./config-fingerprint.js";
export type { R2Operation } from "./map-r2-error.js";

export type {
  CreateObjectStorageOptions,
  ObjectMetadata,
  ObjectStorage,
  PutObjectInput,
  PutObjectResult,
  StorageDriver,
  StorageVisibility,
} from "./types.js";

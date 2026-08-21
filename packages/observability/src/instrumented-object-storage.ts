import {
  isStorageNotFoundError,
  isStorageTransientError,
  type ObjectStorage,
  type PutObjectInput,
  type StorageDriver,
} from "@ai-music/storage";
import {
  musicStorageGetDurationSeconds,
  musicStorageNotFoundTotal,
  musicStoragePutDurationSeconds,
  musicStorageTransientErrorTotal,
  observeDurationLabeled,
} from "./metrics.js";

/**
 * Composition-root decorator: measures put/get and classifies typed storage errors.
 * Does not change ObjectStorage contract.
 */
export function createInstrumentedObjectStorage(
  inner: ObjectStorage,
  driver: StorageDriver,
): ObjectStorage {
  const driverLabel = driver;

  return {
    async putObject(input: PutObjectInput) {
      const started = Date.now();
      try {
        return await inner.putObject(input);
      } catch (error) {
        if (isStorageTransientError(error)) {
          musicStorageTransientErrorTotal.inc({ operation: "put" });
        }
        throw error;
      } finally {
        observeDurationLabeled(musicStoragePutDurationSeconds, { driver: driverLabel }, started);
      }
    },

    async getObject(key: string) {
      const started = Date.now();
      try {
        return await inner.getObject(key);
      } catch (error) {
        if (isStorageNotFoundError(error)) {
          musicStorageNotFoundTotal.inc({ operation: "get" });
        } else if (isStorageTransientError(error)) {
          musicStorageTransientErrorTotal.inc({ operation: "get" });
        }
        throw error;
      } finally {
        observeDurationLabeled(musicStorageGetDurationSeconds, { driver: driverLabel }, started);
      }
    },

    async deleteObject(key: string) {
      try {
        await inner.deleteObject(key);
      } catch (error) {
        if (isStorageTransientError(error)) {
          musicStorageTransientErrorTotal.inc({ operation: "delete" });
        }
        throw error;
      }
    },

    async exists(key: string) {
      return inner.exists(key);
    },

    async getMetadata(key: string) {
      try {
        return await inner.getMetadata(key);
      } catch (error) {
        if (isStorageNotFoundError(error)) {
          musicStorageNotFoundTotal.inc({ operation: "head" });
        } else if (isStorageTransientError(error)) {
          musicStorageTransientErrorTotal.inc({ operation: "head" });
        }
        throw error;
      }
    },

    getSignedReadUrl(key, ttlSeconds) {
      return inner.getSignedReadUrl(key, ttlSeconds);
    },

    getSignedWriteUrl(input) {
      return inner.getSignedWriteUrl(input);
    },

    put(key, data, contentType) {
      return this.putObject({ key, body: data, contentType, kind: "legacy" }).then(() => undefined);
    },

    get(key) {
      return this.getObject(key);
    },

    delete(key) {
      return this.deleteObject(key);
    },
  };
}

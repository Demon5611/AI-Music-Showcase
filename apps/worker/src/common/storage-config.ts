import { logLoadControl } from "@ai-music/shared";
import { describeStorageConfig, type CreateObjectStorageOptions } from "@ai-music/storage";
import { getWorkerEnv } from "../config/env.js";

export type WorkerStorageOptions = Pick<
  CreateObjectStorageOptions,
  "driver" | "localPath" | "r2"
>;

/** Single source of the worker R2 wiring: used by the storage client, logs and probe. */
export function buildWorkerStorageOptions(): WorkerStorageOptions {
  const env = getWorkerEnv();

  return {
    driver: env.STORAGE_DRIVER,
    localPath: env.STORAGE_LOCAL_PATH,
    r2:
      env.STORAGE_DRIVER === "r2"
        ? {
            accountId: env.R2_ACCOUNT_ID!,
            accessKeyId: env.R2_ACCESS_KEY_ID!,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
            bucketName: env.R2_BUCKET_NAME!,
            signedUrlTtlSeconds: env.R2_SIGNED_URL_TTL_SECONDS,
          }
        : undefined,
  };
}

/**
 * Startup snapshot of storage wiring. Fingerprints only, so API and worker logs
 * can be compared for equality without exposing bucket, account or credentials.
 */
export function logStorageConfig(): void {
  logLoadControl("storage_config", {
    service: "worker",
    appEnv: getWorkerEnv().APP_ENV,
    ...describeStorageConfig(buildWorkerStorageOptions()),
  });
}

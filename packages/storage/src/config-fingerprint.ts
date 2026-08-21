import { createHash } from "node:crypto";
import type { CreateObjectStorageOptions, StorageDriver } from "./types.js";

export const ABSENT_FINGERPRINT = "absent";

/**
 * Short one-way digest, safe for logs: services can be compared for equality
 * without exposing bucket names, account ids or credentials.
 */
export function fingerprintValue(value: string | undefined | null): string {
  const trimmed = value?.trim() ?? "";

  if (trimmed.length === 0) {
    return ABSENT_FINGERPRINT;
  }

  return createHash("sha256").update(trimmed).digest("hex").slice(0, 8);
}

export type StorageConfigDescription = {
  storage_driver: StorageDriver;
  bucket_configured: boolean;
  account_configured: boolean;
  access_key_configured: boolean;
  secret_configured: boolean;
  bucket_fingerprint: string;
  account_fingerprint: string;
  access_key_fingerprint: string;
  /**
   * Keys are stored and read verbatim: no driver-level prefix is applied.
   * Environment isolation comes from the bucket, so this is always "none".
   */
  prefix: "none";
  local_path_configured: boolean;
};

/** Startup-safe view of storage wiring. Contains no secret values. */
export function describeStorageConfig(
  options: Pick<CreateObjectStorageOptions, "driver" | "localPath" | "r2">,
): StorageConfigDescription {
  const r2 = options.r2;

  return {
    storage_driver: options.driver,
    bucket_configured: Boolean(r2?.bucketName?.trim()),
    account_configured: Boolean(r2?.accountId?.trim()),
    access_key_configured: Boolean(r2?.accessKeyId?.trim()),
    secret_configured: Boolean(r2?.secretAccessKey?.trim()),
    bucket_fingerprint: fingerprintValue(r2?.bucketName),
    account_fingerprint: fingerprintValue(r2?.accountId),
    access_key_fingerprint: fingerprintValue(r2?.accessKeyId),
    prefix: "none",
    local_path_configured: Boolean(options.localPath?.trim()),
  };
}

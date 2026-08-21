import {
  StorageBucketNotFoundError,
  StorageForbiddenError,
  StorageNotFoundError,
  StorageTransientError,
  StorageUnavailableError,
} from "./errors.js";

export type R2Operation = "put" | "get" | "head" | "delete";

const FORBIDDEN_NAMES = new Set([
  "AccessDenied",
  "Forbidden",
  "InvalidAccessKeyId",
  "SignatureDoesNotMatch",
  "Unauthorized",
]);

const TRANSIENT_NAMES = new Set([
  "TimeoutError",
  "NetworkingError",
  "ThrottlingException",
  "SlowDown",
  "InternalError",
  "ServiceUnavailable",
]);

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function errorName(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  return "name" in error ? String(error.name) : "";
}

function httpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("$metadata" in error)) {
    return undefined;
  }

  const metadata = error.$metadata;

  if (!metadata || typeof metadata !== "object" || !("httpStatusCode" in metadata)) {
    return undefined;
  }

  const status = Number((metadata as { httpStatusCode?: number }).httpStatusCode);

  return Number.isFinite(status) ? status : undefined;
}

function isMissingTarget(error: unknown): boolean {
  const name = errorName(error);

  return name === "NotFound" || name === "NoSuchKey" || httpStatus(error) === 404;
}

/**
 * Turns an S3/R2 SDK failure into a domain error.
 *
 * The operation matters: R2 answers 404 both for a missing key and for a bucket
 * the credentials cannot see. On `put` a missing key is impossible, so 404 there
 * always means the bucket/account wiring is wrong — reporting it as
 * STORAGE_NOT_FOUND hides a configuration bug.
 */
export function mapR2Error(input: {
  key: string;
  error: unknown;
  operation: R2Operation;
  bucketFingerprint: string;
}): Error {
  const { key, error, operation, bucketFingerprint } = input;

  if (
    error instanceof StorageNotFoundError ||
    error instanceof StorageBucketNotFoundError ||
    error instanceof StorageForbiddenError ||
    error instanceof StorageTransientError
  ) {
    return error;
  }

  const name = errorName(error);
  const status = httpStatus(error);

  if (name === "NoSuchBucket") {
    return new StorageBucketNotFoundError(key, bucketFingerprint);
  }

  if (FORBIDDEN_NAMES.has(name) || status === 401 || status === 403) {
    return new StorageForbiddenError(key, bucketFingerprint);
  }

  if (isMissingTarget(error)) {
    return operation === "put"
      ? new StorageBucketNotFoundError(key, bucketFingerprint)
      : new StorageNotFoundError(key);
  }

  if (TRANSIENT_NAMES.has(name) || (status !== undefined && TRANSIENT_STATUS.has(status))) {
    return new StorageUnavailableError(`Storage unavailable for ${key}`, { cause: error });
  }

  return error instanceof Error ? error : new Error(`Storage error for ${key}`);
}

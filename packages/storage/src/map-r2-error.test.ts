import assert from "node:assert/strict";
import { ABSENT_FINGERPRINT, describeStorageConfig, fingerprintValue } from "./config-fingerprint.js";
import {
  StorageBucketNotFoundError,
  StorageForbiddenError,
  StorageNotFoundError,
  StorageUnavailableError,
} from "./errors.js";
import { mapR2Error, type R2Operation } from "./map-r2-error.js";

const BUCKET_FINGERPRINT = "deadbeef";

function sdkError(name: string, httpStatusCode?: number): Error {
  const error = new Error(name);
  error.name = name;
  Object.assign(error, { $metadata: { httpStatusCode } });
  return error;
}

function map(error: unknown, operation: R2Operation): Error {
  return mapR2Error({
    key: "voice-samples/user/sample.mp3",
    error,
    operation,
    bucketFingerprint: BUCKET_FINGERPRINT,
  });
}

// A 404 on write can never mean "missing key" — it is a bucket/account mismatch.
assert.ok(map(sdkError("NotFound", 404), "put") instanceof StorageBucketNotFoundError);
assert.ok(map(sdkError("NoSuchBucket", 404), "head") instanceof StorageBucketNotFoundError);
assert.ok(map(sdkError("NoSuchBucket", 404), "get") instanceof StorageBucketNotFoundError);

// Reads keep key-level semantics.
assert.ok(map(sdkError("NoSuchKey", 404), "get") instanceof StorageNotFoundError);
assert.ok(map(sdkError("NotFound", 404), "head") instanceof StorageNotFoundError);
assert.ok(map(sdkError("NotFound", 404), "delete") instanceof StorageNotFoundError);

// Credentials problems must not look like missing data.
assert.ok(map(sdkError("AccessDenied", 403), "put") instanceof StorageForbiddenError);
assert.ok(map(sdkError("InvalidAccessKeyId", 403), "get") instanceof StorageForbiddenError);
assert.ok(map(sdkError("SignatureDoesNotMatch", 403), "head") instanceof StorageForbiddenError);

// Retryable provider failures.
for (const status of [408, 429, 500, 502, 503, 504]) {
  assert.ok(map(sdkError("ServiceError", status), "put") instanceof StorageUnavailableError);
}
assert.ok(map(sdkError("NetworkingError"), "get") instanceof StorageUnavailableError);

assert.equal(map(sdkError("ServiceError", 503), "get").name, "StorageUnavailableError");
assert.equal(
  (map(sdkError("ServiceError", 503), "get") as StorageUnavailableError).code,
  "STORAGE_UNAVAILABLE",
);
assert.equal(
  (map(sdkError("NotFound", 404), "put") as StorageBucketNotFoundError).code,
  "STORAGE_BUCKET_NOT_FOUND",
);
assert.equal(
  (map(sdkError("AccessDenied", 403), "put") as StorageForbiddenError).code,
  "STORAGE_FORBIDDEN",
);

// Already-mapped domain errors pass through untouched.
const domainError = new StorageNotFoundError("k");
assert.equal(map(domainError, "get"), domainError);

// Unknown errors are not misclassified.
const unknown = new Error("boom");
assert.equal(map(unknown, "put"), unknown);

// Bucket/account values never leak into messages.
const bucketError = map(sdkError("NoSuchBucket", 404), "put");
assert.equal(bucketError.message.includes(BUCKET_FINGERPRINT), true);
assert.equal(bucketError.message.includes("ai-music"), false);

// Fingerprints are stable, distinct and hide the input.
assert.equal(fingerprintValue("ai-music-prod"), fingerprintValue("ai-music-prod"));
assert.notEqual(fingerprintValue("ai-music-prod"), fingerprintValue("ai-music-staging"));
assert.equal(fingerprintValue(undefined), ABSENT_FINGERPRINT);
assert.equal(fingerprintValue("  "), ABSENT_FINGERPRINT);
assert.equal(fingerprintValue("ai-music-prod").length, 8);

const described = describeStorageConfig({
  driver: "r2",
  r2: {
    accountId: "account-value",
    accessKeyId: "access-key-value",
    secretAccessKey: "secret-value",
    bucketName: "bucket-value",
  },
});
assert.equal(described.storage_driver, "r2");
assert.equal(described.bucket_configured, true);
assert.equal(described.account_configured, true);
assert.equal(described.access_key_configured, true);
assert.equal(described.secret_configured, true);
assert.equal(described.prefix, "none");

const serialized = JSON.stringify(described);
for (const value of ["account-value", "access-key-value", "secret-value", "bucket-value"]) {
  assert.equal(serialized.includes(value), false);
}

const local = describeStorageConfig({ driver: "local", localPath: "./storage" });
assert.equal(local.bucket_fingerprint, ABSENT_FINGERPRINT);
assert.equal(local.local_path_configured, true);

console.log("map-r2-error unit tests passed");

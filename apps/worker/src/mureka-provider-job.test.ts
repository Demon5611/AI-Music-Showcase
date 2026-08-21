import assert from "node:assert/strict";
import {
  buildStuckCloneMetadata,
  MUREKA_PENDING_EXTERNAL_ID_PREFIX,
  MUREKA_VOICE_CLONE_STALE_MS,
  resolveRecoveryPollAttempt,
} from "./mureka-provider-job-reconciler.js";
import {
  classifyVocalCloneProviderError,
  isMurekaMp3Source,
  mergeFailureMetadata,
} from "./processors/process-mureka-vocal-clone.js";
import { MurekaHttpError } from "@ai-music/ai-providers";

assert.equal(isMurekaMp3Source("audio/mpeg", "voice.bin"), true);
assert.equal(isMurekaMp3Source("audio/mpeg; charset=binary", "voice.bin"), true);
assert.equal(isMurekaMp3Source("application/octet-stream", "voice.mp3"), true);
assert.equal(isMurekaMp3Source("audio/webm", "voice.webm"), false);

assert.equal(resolveRecoveryPollAttempt(0, 0), 1);
assert.equal(resolveRecoveryPollAttempt(0, 59_999), 12);
assert.equal(resolveRecoveryPollAttempt(0, 60_000), 13);
assert.equal(resolveRecoveryPollAttempt(0, 70_000), 14);

// Stuck clone reconcile must outlive BullMQ retries (3 attempts, 30s backoff).
assert.ok(MUREKA_VOICE_CLONE_STALE_MS > 5 * 60_000);
assert.equal(MUREKA_PENDING_EXTERNAL_ID_PREFIX, "pending:");

// Failure marker is added without dropping the audit fields written on create.
assert.deepEqual(
  buildStuckCloneMetadata({ operationKey: "voice-profile:u1:s1:mureka:v1", requestId: "req-1" }),
  {
    operationKey: "voice-profile:u1:s1:mureka:v1",
    requestId: "req-1",
    failureCode: "clone_stuck_reconciled",
  },
);
assert.deepEqual(buildStuckCloneMetadata(null), {
  failureCode: "clone_stuck_reconciled",
});
assert.deepEqual(buildStuckCloneMetadata(["unexpected"]), {
  failureCode: "clone_stuck_reconciled",
});

// Provider terminal error → terminal classification; retryable must not terminalize.
const terminal = classifyVocalCloneProviderError(
  new MurekaHttpError({
    message: "bad request",
    kind: "validation",
    httpStatus: 400,
    retryable: false,
  }),
);
assert.equal(terminal.terminal, true);
assert.equal(terminal.kind, "validation");
assert.equal(terminal.httpStatus, 400);

const retryable = classifyVocalCloneProviderError(
  new MurekaHttpError({
    message: "Mureka network error",
    kind: "network",
    retryable: true,
  }),
);
assert.equal(retryable.terminal, false);
assert.equal(retryable.kind, "network");

const schemaInvalid = classifyVocalCloneProviderError(
  new MurekaHttpError({
    message: "Mureka response failed schema validation",
    kind: "unknown",
    httpStatus: 200,
    retryable: false,
  }),
);
assert.equal(schemaInvalid.responseInvalid, true);
assert.equal(schemaInvalid.terminal, true);

// Undici "unknown scheme" must be configuration (terminal), never network/retryable.
const unknownScheme = classifyVocalCloneProviderError(
  new MurekaHttpError({
    message: "Mureka base URL has an invalid scheme or is not absolute",
    kind: "configuration",
    retryable: false,
    ambiguous: false,
  }),
);
assert.equal(unknownScheme.kind, "configuration");
assert.equal(unknownScheme.terminal, true);
assert.equal(unknownScheme.responseInvalid, false);

// Failure metadata merge keeps create-time audit fields.
assert.deepEqual(
  mergeFailureMetadata(
    { operationKey: "voice-profile:u1:s1:mureka:v1", normalizedBytes: 100 },
    {
      message: "provider boom",
      failureCode: "provider_terminal",
      errorKind: "validation",
      httpStatus: 400,
    },
  ),
  {
    operationKey: "voice-profile:u1:s1:mureka:v1",
    normalizedBytes: 100,
    error: "provider boom",
    failureCode: "provider_terminal",
    errorKind: "validation",
    httpStatus: 400,
  },
);

console.log("mureka provider job tests passed");

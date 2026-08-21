/**
 * Clerk auth verifier contracts — safe diagnostics, no token/secret leakage.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/auth/clerk-auth.unit.test.ts
 */
import assert from "node:assert/strict";
import {
  ClerkAPIResponseError,
  TokenVerificationError,
  TokenVerificationErrorAction,
  TokenVerificationErrorReason,
} from "@clerk/backend/errors";
import { createClerkAuthVerifier } from "./clerk-auth.js";
import type { ClerkAuthLogEvent, ClerkAuthLogFields } from "./clerk-auth-log.js";

type LogEntry = { event: ClerkAuthLogEvent; fields: ClerkAuthLogFields };

function createLogCapture() {
  const entries: LogEntry[] = [];
  return {
    entries,
    log(event: ClerkAuthLogEvent, fields: ClerkAuthLogFields = {}) {
      entries.push({ event, fields });
    },
  };
}

function assertNoSensitiveLeak(entries: LogEntry[], token: string, secret: string) {
  const serialized = JSON.stringify(entries);
  assert.equal(serialized.includes(token), false, "must not log raw token");
  assert.equal(serialized.includes(secret), false, "must not log secret key");
  assert.equal(serialized.includes("Authorization"), false);
  assert.equal(serialized.includes("Bearer "), false);
}

{
  const capture = createLogCapture();
  const secret = "sk_test_secret_value";
  const token = "eyJhbGciOiJIUzI1NiJ9.payload.signature-fake-token";

  const verifier = createClerkAuthVerifier({
    secretKey: secret,
    appEnv: "staging",
    log: capture.log,
    verifyTokenFn: async () => {
      throw new TokenVerificationError({
        message: "JWT is expired",
        reason: TokenVerificationErrorReason.TokenExpired,
        action: TokenVerificationErrorAction.EnsureClockSync,
      });
    },
  });

  const identity = await verifier.verify(token);
  assert.equal(identity, null);
  assert.equal(capture.entries.length, 1);
  assert.equal(capture.entries[0]?.event, "clerk_token_verification_failed");
  assert.equal(capture.entries[0]?.fields.reason, "token-expired");
  assert.equal(capture.entries[0]?.fields.errorName, "TokenVerificationError");
  assertNoSensitiveLeak(capture.entries, token, secret);
}

{
  const capture = createLogCapture();
  const secret = "sk_test_secret_value";
  const token = "header.payload.sig";

  const verifier = createClerkAuthVerifier({
    secretKey: secret,
    appEnv: "staging",
    log: capture.log,
    verifyTokenFn: async () => ({ sub: "user_abc" }) as never,
    clerkClient: {
      users: {
        getUser: async () => {
          throw new ClerkAPIResponseError("Not Found", {
            data: [
              {
                code: "resource_not_found",
                message: "not found",
                long_message: "User not found",
              },
            ],
            status: 404,
          });
        },
      },
    },
  });

  const identity = await verifier.verify(token);
  assert.equal(identity, null);
  assert.equal(capture.entries[0]?.event, "clerk_user_fetch_failed");
  assert.equal(capture.entries[0]?.fields.userId, "user_abc");
  assert.equal(capture.entries[0]?.fields.status, 404);
  assert.deepEqual(capture.entries[0]?.fields.errorCodes, ["resource_not_found"]);
  assertNoSensitiveLeak(capture.entries, token, secret);
}

{
  const capture = createLogCapture();
  const secret = "sk_test_secret_value";
  const token = "header.payload.sig";

  const verifier = createClerkAuthVerifier({
    secretKey: secret,
    appEnv: "staging",
    log: capture.log,
    verifyTokenFn: async () => ({ sub: "user_no_email" }) as never,
    clerkClient: {
      users: {
        getUser: async () => ({
          emailAddresses: [],
          firstName: "No",
          lastName: "Email",
          publicMetadata: {},
        }),
      },
    },
  });

  const identity = await verifier.verify(token);
  assert.equal(identity, null);
  assert.equal(capture.entries[0]?.event, "clerk_user_email_missing");
  assert.equal(capture.entries[0]?.fields.userId, "user_no_email");
  assert.equal(JSON.stringify(capture.entries).includes("@"), false);
  assertNoSensitiveLeak(capture.entries, token, secret);
}

{
  const capture = createLogCapture();
  const secret = "sk_test_secret_value";
  const token = "header.payload.sig";

  const verifier = createClerkAuthVerifier({
    secretKey: secret,
    appEnv: "staging",
    log: capture.log,
    verifyTokenFn: async () => ({ sub: "user_ok" }) as never,
    clerkClient: {
      users: {
        getUser: async () => ({
          emailAddresses: [{ emailAddress: "ok@example.com" }],
          firstName: "Ok",
          lastName: "User",
          publicMetadata: { role: "admin" },
        }),
      },
    },
  });

  const identity = await verifier.verify(token);
  assert.deepEqual(identity, {
    userId: "user_ok",
    email: "ok@example.com",
    name: "Ok User",
    role: "admin",
  });
  assert.equal(capture.entries[0]?.event, "clerk_auth_verified");
  assert.equal(capture.entries[0]?.fields.userId, "user_ok");
  assert.equal(capture.entries[0]?.fields.role, "admin");
  assert.equal(JSON.stringify(capture.entries).includes("ok@example.com"), false);
  assertNoSensitiveLeak(capture.entries, token, secret);
}

{
  const capture = createLogCapture();
  const verifier = createClerkAuthVerifier({
    secretKey: "sk_test_secret_value",
    appEnv: "staging",
    log: capture.log,
    verifyTokenFn: async () => {
      throw new TokenVerificationError({
        message: "Invalid secret key",
        reason: TokenVerificationErrorReason.InvalidSecretKey,
        action: TokenVerificationErrorAction.SetClerkSecretKey,
      });
    },
  });

  assert.equal(await verifier.verify("t"), null);
  assert.equal(capture.entries[0]?.fields.reason, "secret-key-invalid");
  assert.equal(
    capture.entries[0]?.fields.action,
    TokenVerificationErrorAction.SetClerkSecretKey,
  );
}

{
  // Missing sub after verify → null (malformed identity)
  const capture = createLogCapture();
  const verifier = createClerkAuthVerifier({
    secretKey: "sk_test_secret_value",
    appEnv: "staging",
    log: capture.log,
    verifyTokenFn: async () => ({}) as never,
  });
  assert.equal(await verifier.verify("t"), null);
  assert.equal(capture.entries[0]?.event, "clerk_token_missing_sub");
}

console.log("clerk-auth.unit.test.ts: ok");

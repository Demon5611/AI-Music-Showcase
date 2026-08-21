/**
 * Unit tests for Suno callback HMAC helpers.
 * Run: `pnpm --filter @ai-music/api exec tsx ../../packages/shared/src/suno-callback-token.test.ts`
 * or after build: `node --test` via api test:callback (imports shared source through tsx).
 */
import assert from "node:assert/strict";
import {
  buildSunoCallbackMacPayload,
  buildSunoSignedCallbackUrl,
  createSunoCallbackToken,
  parseSunoCallbackToken,
  verifySunoCallbackToken,
} from "./suno-callback-token.js";

const SECRET = "unit-test-secret";

function run(): void {
  const payload = buildSunoCallbackMacPayload("rec1", 1_700_000_000);
  assert.equal(payload, "v1:suno-callback:rec1:1700000000");

  const token = createSunoCallbackToken(SECRET, "rec1", 3600, 1_700_000_000);
  const parsed = parseSunoCallbackToken(token);
  assert.ok(parsed);
  assert.equal(parsed.version, "v1");
  assert.equal(parsed.expiresAtSec, 1_700_003_600);
  assert.equal(parsed.signatureHex.length, 64);

  assert.equal(verifySunoCallbackToken(SECRET, "rec1", token, 1_700_000_100), true);
  assert.equal(verifySunoCallbackToken(SECRET, "other", token, 1_700_000_100), false);
  assert.equal(verifySunoCallbackToken("wrong", "rec1", token, 1_700_000_100), false);
  assert.equal(verifySunoCallbackToken(SECRET, "rec1", token, 1_700_003_601), false);

  const expired = createSunoCallbackToken(SECRET, "rec1", -5, 1_700_000_000);
  assert.equal(verifySunoCallbackToken(SECRET, "rec1", expired, 1_700_000_000), false);

  const url = buildSunoSignedCallbackUrl(
    "https://api.example.com/",
    "rec/../x",
    "v1.1.abc",
  );
  assert.equal(
    url,
    "https://api.example.com/api/music/callback/suno/rec%2F..%2Fx/v1.1.abc",
  );

  console.log("suno-callback-token unit tests passed");
}

run();

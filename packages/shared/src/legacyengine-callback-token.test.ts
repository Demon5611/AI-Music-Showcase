/**
 * Unit tests for Legacyengine callback HMAC helpers.
 * Run: `pnpm --filter @ai-music/api exec tsx ../../packages/shared/src/legacyengine-callback-token.test.ts`
 * or after build: `node --test` via api test:callback (imports shared source through tsx).
 */
import assert from "node:assert/strict";
import {
  buildLegacyengineCallbackMacPayload,
  buildLegacyengineSignedCallbackUrl,
  createLegacyengineCallbackToken,
  parseLegacyengineCallbackToken,
  verifyLegacyengineCallbackToken,
} from "./legacyengine-callback-token.js";

const SECRET = "unit-test-secret";

function run(): void {
  const payload = buildLegacyengineCallbackMacPayload("rec1", 1_700_000_000);
  assert.equal(payload, "v1:legacyengine-callback:rec1:1700000000");

  const token = createLegacyengineCallbackToken(SECRET, "rec1", 3600, 1_700_000_000);
  const parsed = parseLegacyengineCallbackToken(token);
  assert.ok(parsed);
  assert.equal(parsed.version, "v1");
  assert.equal(parsed.expiresAtSec, 1_700_003_600);
  assert.equal(parsed.signatureHex.length, 64);

  assert.equal(verifyLegacyengineCallbackToken(SECRET, "rec1", token, 1_700_000_100), true);
  assert.equal(verifyLegacyengineCallbackToken(SECRET, "other", token, 1_700_000_100), false);
  assert.equal(verifyLegacyengineCallbackToken("wrong", "rec1", token, 1_700_000_100), false);
  assert.equal(verifyLegacyengineCallbackToken(SECRET, "rec1", token, 1_700_003_601), false);

  const expired = createLegacyengineCallbackToken(SECRET, "rec1", -5, 1_700_000_000);
  assert.equal(verifyLegacyengineCallbackToken(SECRET, "rec1", expired, 1_700_000_000), false);

  const url = buildLegacyengineSignedCallbackUrl(
    "https://api.example.com/",
    "rec/../x",
    "v1.1.abc",
  );
  assert.equal(
    url,
    "https://api.example.com/api/music/callback/legacyengine/rec%2F..%2Fx/v1.1.abc",
  );

  console.log("legacyengine-callback-token unit tests passed");
}

run();

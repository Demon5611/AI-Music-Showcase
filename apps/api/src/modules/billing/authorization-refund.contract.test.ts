/**
 * Authorization + monetary refund contracts.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/billing/authorization-refund.contract.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  REFUND_STATUSES,
  TBC_REFUND_QUEUE_NAME,
  approveRefundRequestSchema,
  createRefundRequestSchema,
  createSignedReadUrlSchema,
  tbcRefundJobId,
} from "@ai-music/shared";

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(here, "../..");

function read(rel: string): string {
  return readFileSync(join(apiRoot, rel), "utf8");
}

// A–D: signed-url must not accept raw keys
{
  const rawKey = createSignedReadUrlSchema.safeParse({
    key: "voice-samples/other-user/x.mp3",
    mode: "read",
  });
  assert.equal(rawKey.success, false, "raw key body rejected");

  const owned = createSignedReadUrlSchema.safeParse({
    resourceType: "music_track",
    resourceId: "track_1",
  });
  assert.equal(owned.success, true);

  const storageRoutes = read("modules/storage/routes.ts");
  assert.match(storageRoutes, /resolveOwnedStorageKey/);
  assert.doesNotMatch(storageRoutes, /createSignedWriteUrl/);
}

// E–F: requireAdmin exists; OPS token not mixed
{
  const requireAdmin = read("common/require-admin.ts");
  assert.match(requireAdmin, /authRole !== "admin"/);
  assert.doesNotMatch(requireAdmin, /assertOpsAdmin|OPS_ADMIN_TOKEN\?/);
  assert.match(requireAdmin, /authorization_denied/);
}

// G: userId from body ignored as identity
{
  const refundService = read("modules/billing/refund.service.ts");
  assert.match(refundService, /requeueApprovedRefund/);
assert.match(read("modules/billing/refund.routes.ts"), /\/api\/admin\/refunds\/:refundId\/requeue/);
  assert.match(refundService, /userId in body is not an identity source/);
}

// H–I: refund request schema — paymentId + reason only (no amount / payId)
{
  const ok = createRefundRequestSchema.safeParse({
    paymentId: "purchase_1",
    reason: "duplicate charge",
  });
  assert.equal(ok.success, true);

  const withAmount = createRefundRequestSchema.safeParse({
    paymentId: "purchase_1",
    reason: "x".repeat(5),
    amount: 10,
  });
  // amount is stripped/ignored by zod object (unknown keys stripped by default)
  assert.equal(withAmount.success, true);
  assert.equal("amount" in (withAmount.data ?? {}), false);
}

// J–K: deterministic job id; approve schema
{
  assert.equal(tbcRefundJobId("req_abc"), "tbc-refund-req_abc");
  assert.equal(tbcRefundJobId("req_abc").includes(":"), false);
  assert.equal(TBC_REFUND_QUEUE_NAME, "tbc-refund");

  const full = approveRefundRequestSchema.safeParse({ mode: "full" });
  assert.equal(full.success, true);

  const partialBad = approveRefundRequestSchema.safeParse({ mode: "partial" });
  assert.equal(partialBad.success, false);

  const partialOk = approveRefundRequestSchema.safeParse({
    mode: "partial",
    amount: 5,
  });
  assert.equal(partialOk.success, true);
}

// Status machine includes needs_review
{
  assert.ok(REFUND_STATUSES.includes("needs_review"));
  assert.ok(REFUND_STATUSES.includes("requested"));
  assert.ok(REFUND_STATUSES.includes("refunded"));
}

// Album cover HMAC ordering
{
  const callback = read("modules/music/suno-callback.service.ts");
  const verifyIdx = callback.indexOf("verifySunoCallbackToken");
  const coverIdx = callback.indexOf("applyAlbumCoverCallback(coverEarly");
  assert.ok(verifyIdx > 0 && coverIdx > verifyIdx, "HMAC before album-cover apply");
  assert.match(callback, /SUNO_CALLBACK_LEGACY_ENABLED/);
}

// Metrics staging+production token required (fail closed)
{
  const health = read("modules/health/routes.ts");
  assert.match(health, /env\.isDeployed && !env\.METRICS_BEARER_TOKEN/);
}

// test/status staging+production ops gate; user Create uses provider-status + requireAuth
{
  const musicRoutes = read("modules/music/routes.ts");
  const testStatusBlock = musicRoutes.slice(
    musicRoutes.indexOf('/api/music/test/status"'),
    musicRoutes.indexOf('/api/music/provider-status"'),
  );
  assert.match(testStatusBlock, /assertOpsAdmin/);
  assert.match(testStatusBlock, /env\.isDeployed/);

  const providerStatusBlock = musicRoutes.slice(
    musicRoutes.indexOf('/api/music/provider-status"'),
    musicRoutes.indexOf('/api/music/history"'),
  );
  assert.match(providerStatusBlock, /preHandler:\s*requireAuth/);
  assert.doesNotMatch(providerStatusBlock, /assertOpsAdmin/);
}

// Credit refund vs money refund separation (no auto RefundRequest on generation fail)
{
  const sunoCallback = read("modules/music/suno-callback.service.ts");
  assert.match(sunoCallback, /refundOriginalSpend/);
  assert.doesNotMatch(sunoCallback, /createRefundRequest|RefundRequest/);
}

console.log("authorization-refund.contract.test.ts: ok");

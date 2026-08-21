/**
 * Cancel-at-most-once + reconcile contracts for TBC refund processor.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/billing/tbc-refund-idempotency.contract.test.ts
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
  tbcRefundJobId,
} from "@ai-music/shared";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const processor = readFileSync(
  join(repoRoot, "packages/tbc-checkout/src/process-tbc-refund.ts"),
  "utf8",
);
const sunoCallback = readFileSync(
  join(repoRoot, "apps/api/src/modules/music/suno-callback.service.ts"),
  "utf8",
);
const metricsRoutes = readFileSync(
  join(repoRoot, "apps/api/src/modules/health/routes.ts"),
  "utf8",
);

// Deterministic job id without colon
assert.equal(tbcRefundJobId("abc"), "tbc-refund-abc");
assert.equal(tbcRefundJobId("abc").includes(":"), false);
assert.equal(TBC_REFUND_QUEUE_NAME, "tbc-refund");

// State machine includes needs_review
for (const s of [
  "requested",
  "approved",
  "processing",
  "refunded",
  "rejected",
  "failed",
  "needs_review",
]) {
  assert.ok(REFUND_STATUSES.includes(s as (typeof REFUND_STATUSES)[number]));
}

// Cancel-at-most-once markers
assert.match(processor, /cancelAlreadyAttempted|isCancelAlreadyAttempted/);
assert.match(processor, /providerReference/);
assert.match(processor, /getPaymentDetails/);
assert.match(processor, /needs_review/);
assert.match(processor, /never cancel again/i);
assert.match(processor, /ambiguous_cancel_attempted:/);
assert.match(processor, /persistAmbiguousCancelAttempted/);

// After successful cancel HTTP, persist providerReference before reconcile retries
const refundCallIdx = processor.indexOf("await provider.refund(");
const persistRefIdx = processor.indexOf("providerReference: row.id", refundCallIdx);
assert.ok(refundCallIdx > 0 && persistRefIdx > refundCallIdx);

// Ambiguous cancel must persist durable marker before in-flight retry return
const ambiguousIdx = processor.indexOf("Ambiguous: do not blind-retry cancel");
const persistAmbiguousIdx = processor.indexOf(
  "persistAmbiguousCancelAttempted",
  ambiguousIdx,
);
const inFlightAfterErrorIdx = processor.indexOf(
  "cancel_payment_processing_after_error",
  ambiguousIdx,
);
assert.ok(
  persistAmbiguousIdx > ambiguousIdx &&
    inFlightAfterErrorIdx > persistAmbiguousIdx,
  "ambiguous marker must be persisted before in-flight retry",
);

// Credit vs money separation
assert.match(sunoCallback, /refundOriginalSpend/);
assert.doesNotMatch(sunoCallback, /createRefundRequest|RefundRequest|tbc-refund/);
assert.doesNotMatch(processor, /refundCredits|refundOriginalSpend|spendCredits/);

// Metrics staging+production gate
assert.match(metricsRoutes, /env\.isDeployed && !env\.METRICS_BEARER_TOKEN/);

// Approve/amount schemas
assert.equal(approveRefundRequestSchema.safeParse({ mode: "full" }).success, true);
assert.equal(approveRefundRequestSchema.safeParse({ mode: "partial" }).success, false);
assert.equal(
  approveRefundRequestSchema.safeParse({ mode: "partial", amount: 1 }).success,
  true,
);
assert.equal(
  createRefundRequestSchema.safeParse({ paymentId: "p", reason: "ok reason" }).success,
  true,
);
assert.equal("amount" in (createRefundRequestSchema.parse({ paymentId: "p", reason: "ok reason" }) as object), false);

console.log("tbc-refund-idempotency.contract.test.ts: ok");

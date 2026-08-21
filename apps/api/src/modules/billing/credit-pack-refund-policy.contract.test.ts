/**
 * Credit-pack refund eligibility contracts.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/billing/credit-pack-refund-policy.contract.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CREDIT_PACK_REFUND_REVIEW_REASONS,
  evaluateCreditPackRefundApproval,
} from "@ai-music/shared";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../../..");
const refundService = readFileSync(join(here, "refund.service.ts"), "utf8");
const ledger = readFileSync(join(repoRoot, "packages/db/src/credits-ledger.ts"), "utf8");
const lots = readFileSync(join(repoRoot, "packages/db/src/credit-grant-lots.ts"), "utf8");
const flittProcessor = readFileSync(
  join(repoRoot, "packages/flitt-checkout/src/process-flitt-refund.ts"),
  "utf8",
);

assert.equal(
  evaluateCreditPackRefundApproval({
    mode: "full",
    lot: { grantAmountUnits: 500_000, remainingAmountUnits: 0, reservedAmountUnits: 0 },
  }).action,
  "approve",
);

assert.doesNotMatch(refundService, /reservePurchaseLotForRefund/);
assert.match(refundService, /enqueueApprovedRefundOrThrow/);
assert.match(refundService, /RefundEnqueueFailedError/);
assert.match(
  readFileSync(join(here, "refund.routes.ts"), "utf8"),
  /\/api\/admin\/refunds\/:refundId\/requeue/,
);
assert.match(refundService, /needs_review/);
assert.doesNotMatch(ledger, /reservedUnitsForUser/);
assert.match(ledger, /sourceSpendIdempotencyKey/);
assert.match(ledger, /restoreLotsForExactSourceSpend/);
assert.doesNotMatch(ledger, /restoreLotsForRelatedSpends/);
assert.doesNotMatch(lots, /restoreLotsForRelatedSpends/);
assert.match(
  readFileSync(join(repoRoot, "apps/worker/src/processors/generate-song.ts"), "utf8"),
  /sourceSpendIdempotencyKey:\s*`generation:\$\{payload\.jobId\}:spend`/,
);
assert.match(
  readFileSync(join(repoRoot, "apps/worker/src/provider-job-reconciler.ts"), "utf8"),
  /sourceSpendIdempotencyKey:\s*spendKey\(recordId\)/,
);
assert.match(flittProcessor, /releasePurchaseLotReservation/);
assert.match(flittProcessor, /finalizeUserCashRefundLocalEffects/);
assert.match(flittProcessor, /CreditClawbackInvariantError/);
assert.doesNotMatch(flittProcessor, /finalizeCreditPackRefundClawback/);
assert.doesNotMatch(flittProcessor, /amountUnits:\s*creditsToUnits/);
assert.equal(
  CREDIT_PACK_REFUND_REVIEW_REASONS.clawbackInvariant,
  "CREDIT_CLAWBACK_INVARIANT_VIOLATION",
);
assert.doesNotMatch(flittProcessor, /nbg\.gov\.ge/);
assert.equal(
  CREDIT_PACK_REFUND_REVIEW_REASONS.partialRequiresReview,
  "PARTIAL_CREDIT_PACK_REFUND_REQUIRES_REVIEW",
);

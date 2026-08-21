/**
 * User balance contract: available credits = ledger SUM.
 * Refund workflow must not freeze/reserve user credits.
 *
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/billing/refund-balance-contract.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateCreditPackRefundApproval,
  hasRefundProviderAttemptMarker,
} from "@ai-music/shared";
import {
  lotAvailableUnits,
  planCreditPackRefundClawback,
  spendableBalanceUnits,
} from "@ai-music/db";
import { evaluateRefundRequeue } from "./refund-enqueue.service.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../../..");
const refundService = readFileSync(join(here, "refund.service.ts"), "utf8");
const ledger = readFileSync(join(repoRoot, "packages/db/src/credits-ledger.ts"), "utf8");
const lots = readFileSync(join(repoRoot, "packages/db/src/credit-grant-lots.ts"), "utf8");
const recovery = readFileSync(join(here, "refund-recovery.service.ts"), "utf8");
const creditsRoutes = readFileSync(
  join(here, "../credits/routes.ts"),
  "utf8",
);

describe("refund/credits balance contract", () => {
  it("1. purchase pack remaining is fully available for spend planning", () => {
    assert.equal(
      lotAvailableUnits({ remainingAmountUnits: 500_000, reservedAmountUnits: 0 }),
      500_000,
    );
    assert.equal(
      lotAvailableUnits({ remainingAmountUnits: 500_000, reservedAmountUnits: 500_000 }),
      500_000,
    );
  });

  it("2–3. approved refund must not reserve lots or change spendable math", () => {
    assert.doesNotMatch(refundService, /reservePurchaseLotForRefund/);
    assert.equal(spendableBalanceUnits(510_000, 500_000), 510_000);
    assert.equal(
      evaluateCreditPackRefundApproval({
        mode: "full",
        lot: {
          grantAmountUnits: 500_000,
          remainingAmountUnits: 500_000,
          reservedAmountUnits: 0,
        },
      }).action,
      "approve",
    );
  });

  it("4. approved refund + fully consumed pack still approves monetary full refund", () => {
    assert.equal(
      evaluateCreditPackRefundApproval({
        mode: "full",
        lot: {
          grantAmountUnits: 500_000,
          remainingAmountUnits: 0,
          reservedAmountUnits: 0,
        },
      }).action,
      "approve",
    );
  });

  it("5–6. processing/ambiguous refund states do not subtract from spendable", () => {
    assert.equal(spendableBalanceUnits(510_000, 0), 510_000);
    assert.doesNotMatch(ledger, /reservedUnitsForUser/);
    assert.ok(hasRefundProviderAttemptMarker(null, "ambiguous_reverse_attempted:x"));
  });

  it("7–9. enqueue fail / admin requeue / automatic recovery work without reservation", () => {
    assert.match(refundService, /RefundEnqueueFailedError/);
    assert.deepEqual(
      evaluateRefundRequeue({
        status: "approved",
        refundId: "rr-1",
        providerReference: null,
        providerError: null,
      }),
      { ok: true },
    );
    assert.doesNotMatch(recovery, /creditGrantLot/);
    assert.match(recovery, /evaluateRefundRequeue/);
  });

  it("10. public balance endpoint stays ledger-based", () => {
    assert.match(creditsRoutes, /getCreditsBalance/);
    assert.doesNotMatch(creditsRoutes, /spendable|reserved|freeze/i);
  });

  it("11. lots remain for provenance/FIFO but reservation is inert for spend", () => {
    assert.match(lots, /ensureLotForGrant/);
    assert.match(lots, /consumeLotsForSpend/);
    assert.match(lots, /lotAvailableUnits/);
    assert.match(lots, /void lot\.reservedAmountUnits/);
  });

  it("12. provider duplicate guards remain; no-reservation clawback does not invent debit", () => {
    const openLotPlan = planCreditPackRefundClawback({
      userId: "user-1",
      purchaseId: "pay-1",
      refundRequestId: "rr-1",
      lot: {
        id: "lot-1",
        userId: "user-1",
        sourcePurchaseId: "pay-1",
        status: "open",
        reservedRefundRequestId: null,
        reservedAmountUnits: 0,
        remainingAmountUnits: 200_000,
      },
      existingClawback: null,
    });
    assert.deepEqual(openLotPlan, {
      action: "idempotent_success",
      clawbackAmountUnits: 0,
      markLotClawed: false,
    });

    const legacyReserved = planCreditPackRefundClawback({
      userId: "user-1",
      purchaseId: "pay-1",
      refundRequestId: "rr-1",
      lot: {
        id: "lot-1",
        userId: "user-1",
        sourcePurchaseId: "pay-1",
        status: "reserved",
        reservedRefundRequestId: "rr-1",
        reservedAmountUnits: 500_000,
        remainingAmountUnits: 500_000,
      },
      existingClawback: null,
    });
    assert.deepEqual(legacyReserved, {
      action: "apply",
      clawbackAmountUnits: 500_000,
    });
  });
});

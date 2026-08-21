/**
 * User cash-refund entitlement + cumulative money contracts.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/billing/cash-refund-policy.contract.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CASH_REFUND_REVIEW_REASONS,
  CASH_REFUND_SCOPES,
  computeCumulativeCashRefundMinor,
  createRefundRequestSchema,
  majorDecimalStringToMinorUnits,
  minorUnitsToMajorDecimalString,
} from "@ai-music/shared";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../../..");
const refundService = readFileSync(join(here, "refund.service.ts"), "utf8");
const flittProcessor = readFileSync(
  join(repoRoot, "packages/flitt-checkout/src/process-flitt-refund.ts"),
  "utf8",
);
const tbcProcessor = readFileSync(
  join(repoRoot, "packages/tbc-checkout/src/process-tbc-refund.ts"),
  "utf8",
);
const migration = readFileSync(
  join(repoRoot, "packages/db/prisma/migrations/20260820120000_cash_refund_entitlement/migration.sql"),
  "utf8",
);

describe("cash refund product policy contracts", () => {
  it("distinguishes purchase_remainder vs operation scopes", () => {
    assert.deepEqual([...CASH_REFUND_SCOPES], ["purchase_remainder", "operation"]);
  });

  it("create schema supports operation spend id and purchase remainder paymentId", () => {
    assert.equal(
      createRefundRequestSchema.safeParse({
        paymentId: "pay-1",
        reason: "unused pack",
      }).success,
      true,
    );
    assert.equal(
      createRefundRequestSchema.safeParse({
        scope: "operation",
        sourceSpendLedgerEntryId: "spend-1",
        reason: "quality issue",
      }).success,
      true,
    );
    assert.equal(
      createRefundRequestSchema.safeParse({
        scope: "operation",
        reason: "missing spend",
      }).success,
      false,
    );
  });

  it("purchase remainder example: 310/500 of 23.52 GEL = 14.58", () => {
    const result = computeCumulativeCashRefundMinor({
      originalAmountMinor: majorDecimalStringToMinorUnits("23.52"),
      grantedCreditUnits: 500_000,
      alreadyRefundedCreditUnits: 0,
      thisRefundCreditUnits: 310_000,
    });
    assert.equal(minorUnitsToMajorDecimalString(result.incrementalRefundMinor), "14.58");
  });

  it("operation mixed paid example: 80/500 of 23.52 GEL = 3.76", () => {
    const result = computeCumulativeCashRefundMinor({
      originalAmountMinor: majorDecimalStringToMinorUnits("23.52"),
      grantedCreditUnits: 500_000,
      alreadyRefundedCreditUnits: 0,
      thisRefundCreditUnits: 80_000,
    });
    assert.equal(minorUnitsToMajorDecimalString(result.incrementalRefundMinor), "3.76");
  });

  it("approve uses credit-provenance entitlement helpers", () => {
    assert.match(refundService, /resolvePurchaseRemainderCashRefund/);
    assert.match(refundService, /resolveOperationCashRefund/);
    assert.match(refundService, /cashRefundCreditUnits/);
    assert.doesNotMatch(refundService, /reservePurchaseLotForRefund/);
  });

  it("worker finalize uses scope-aware local effects", () => {
    assert.match(flittProcessor, /finalizeUserCashRefundLocalEffects/);
    assert.match(tbcProcessor, /finalizeUserCashRefundLocalEffects/);
  });

  it("additive migration adds entitlement columns without DROP", () => {
    assert.match(migration, /cash_refund_credit_units/);
    assert.match(migration, /source_spend_ledger_entry_id/);
    assert.match(migration, /cash_refund_request_id/);
    assert.doesNotMatch(migration, /DROP COLUMN/i);
  });

  it("documents race and compensation failure reasons", () => {
    assert.equal(
      CASH_REFUND_REVIEW_REASONS.creditsConsumedDuringProcessing,
      "REFUND_CREDITS_CONSUMED_DURING_PROCESSING",
    );
    assert.equal(
      CASH_REFUND_REVIEW_REASONS.operationAlreadyCreditCompensated,
      "OPERATION_ALREADY_CREDIT_COMPENSATED",
    );
    assert.equal(
      CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded,
      "OPERATION_ALREADY_CASH_REFUNDED",
    );
  });

  it("mutual exclusion: credit path guards cash XOR before ledger refund", () => {
    const ledger = readFileSync(
      join(repoRoot, "packages/db/src/credits-ledger.ts"),
      "utf8",
    );
    const compensation = readFileSync(
      join(repoRoot, "packages/db/src/spend-credit-compensation.ts"),
      "utf8",
    );
    const lots = readFileSync(
      join(repoRoot, "packages/db/src/credit-grant-lots.ts"),
      "utf8",
    );
    assert.match(compensation, /evaluateSpendCreditCompensation/);
    assert.match(ledger, /assertSpendEligibleForCreditCompensation/);
    assert.match(ledger, /SpendAlreadyCashRefundedError/);
    // Guard must appear before creditTransaction.create in refund path.
    const refundGuardIdx = ledger.indexOf("assertSpendEligibleForCreditCompensation");
    const createIdx = ledger.indexOf("tx.creditTransaction.create");
    assert.ok(refundGuardIdx > 0 && createIdx > refundGuardIdx);
    assert.match(lots, /cashRefundRequestId:\s*null/);
    assert.match(refundService, /lockUserCreditsInTransaction/);
  });
});

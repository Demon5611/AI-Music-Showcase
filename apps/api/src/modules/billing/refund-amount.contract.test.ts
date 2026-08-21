/**
 * Refund amount + admin read-snapshot contracts (unit, no live TBC/HTTP).
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/billing/refund-amount.contract.test.ts
 *
 * Invariants:
 * - eligibility (calculateRefundableAmount) rejects status=refunded
 * - admin read snapshot succeeds for refunded with remaining=0
 * - REFUNDABLE_PURCHASE_STATUSES must not include "refunded"
 * - create/approve paths keep using eligibility; admin GET uses snapshot
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertRefundAmountAllowed,
  calculateRefundableAmount,
  getAdminRefundableAmountSnapshot,
  roundMoney,
} from "./calculate-refundable-amount.js";
import { BadRequestError } from "../../common/errors.js";

const here = dirname(fileURLToPath(import.meta.url));

// M: partial > remaining → reject
{
  assert.throws(
    () => assertRefundAmountAllowed(10.01, 10),
    (error: unknown) =>
      error instanceof BadRequestError && error.code === "REFUND_AMOUNT_EXCEEDS_REMAINING",
  );
  assert.doesNotThrow(() => assertRefundAmountAllowed(10, 10));
  assert.throws(
    () => assertRefundAmountAllowed(0, 10),
    (error: unknown) =>
      error instanceof BadRequestError && error.code === "INVALID_REFUND_AMOUNT",
  );
  assert.equal(roundMoney(1.234), 1.23);
  assert.equal(roundMoney(1.235), 1.24);
}

const repoRoot = join(here, "../../../../..");

// Processor: no blind cancel retry after ambiguity
{
  const processor = readFileSync(
    join(repoRoot, "packages/tbc-checkout/src/process-tbc-refund.ts"),
    "utf8",
  );
  assert.match(processor, /getPaymentDetails/);
  assert.match(processor, /needs_review/);
  assert.match(processor, /CancelPaymentProcessing|cancel_payment_processing/);
  assert.match(processor, /ambiguous/);
}

// TBC cancel path builder
{
  const paths = readFileSync(
    join(repoRoot, "packages/tbc-checkout/src/tbc-paths.ts"),
    "utf8",
  );
  assert.match(paths, /cancel/);
}

type PurchaseSeed = {
  id: string;
  currency: string;
  priceAmount: number;
  status: string;
  provider: string;
  providerPaymentId: string | null;
};

function createRefundAmountDb(options: {
  purchase: PurchaseSeed;
  alreadyRefundedAmount: number;
}) {
  return {
    creditPackPurchase: {
      async findUnique(args: { where: { id: string } }) {
        if (args.where.id !== options.purchase.id) {
          return null;
        }
        return { ...options.purchase };
      },
    },
    refundRequest: {
      async aggregate(_args: unknown) {
        void _args;
        return { _sum: { amount: options.alreadyRefundedAmount } };
      },
    },
  };
}

// Credited purchase → eligibility calculation unchanged (full remaining)
{
  const db = createRefundAmountDb({
    purchase: {
      id: "pay_credited",
      currency: "GEL",
      priceAmount: 29,
      status: "credited",
      provider: "tbc",
      providerPaymentId: "tbc-pay-1",
    },
    alreadyRefundedAmount: 0,
  });

  const result = await calculateRefundableAmount("pay_credited", {
    prismaClient: db as never,
  });

  assert.equal(result.originalPaidAmount, 29);
  assert.equal(result.alreadyRefundedAmount, 0);
  assert.equal(result.remainingRefundableAmount, 29);
  assert.equal(result.purchaseStatus, "credited");
}

// Partial refunded → remaining amount correct
{
  const db = createRefundAmountDb({
    purchase: {
      id: "pay_partial",
      currency: "GEL",
      priceAmount: 29,
      status: "partial_refunded",
      provider: "tbc",
      providerPaymentId: "tbc-pay-2",
    },
    alreadyRefundedAmount: 10,
  });

  const eligibility = await calculateRefundableAmount("pay_partial", {
    prismaClient: db as never,
  });
  assert.equal(eligibility.originalPaidAmount, 29);
  assert.equal(eligibility.alreadyRefundedAmount, 10);
  assert.equal(eligibility.remainingRefundableAmount, 19);
  assert.equal(eligibility.purchaseStatus, "partial_refunded");

  const snapshot = await getAdminRefundableAmountSnapshot("pay_partial", {
    prismaClient: db as never,
  });
  assert.deepEqual(snapshot, eligibility);
}

// Refunded purchase → admin read snapshot succeeds with remaining=0
{
  const db = createRefundAmountDb({
    purchase: {
      id: "pay_refunded",
      currency: "GEL",
      priceAmount: 29,
      status: "refunded",
      provider: "tbc",
      providerPaymentId: "tbc-pay-3",
    },
    alreadyRefundedAmount: 29,
  });

  const snapshot = await getAdminRefundableAmountSnapshot("pay_refunded", {
    prismaClient: db as never,
  });

  assert.equal(snapshot.originalPaidAmount, 29);
  assert.equal(snapshot.alreadyRefundedAmount, 29);
  assert.equal(snapshot.remainingRefundableAmount, 0);
  assert.equal(snapshot.purchaseStatus, "refunded");
}

// Create/approve eligibility on refunded purchase still fails PURCHASE_NOT_REFUNDABLE
{
  const db = createRefundAmountDb({
    purchase: {
      id: "pay_refunded_elig",
      currency: "GEL",
      priceAmount: 29,
      status: "refunded",
      provider: "tbc",
      providerPaymentId: "tbc-pay-4",
    },
    alreadyRefundedAmount: 29,
  });

  await assert.rejects(
    () =>
      calculateRefundableAmount("pay_refunded_elig", {
        prismaClient: db as never,
      }),
    (error: unknown) =>
      error instanceof BadRequestError && error.code === "PURCHASE_NOT_REFUNDABLE",
  );
}

// Double-refund regression: remaining=0 on credited still nothing to refund via amount,
// and refunded status stays outside eligibility (source contract below).
{
  const db = createRefundAmountDb({
    purchase: {
      id: "pay_zero_left",
      currency: "GEL",
      priceAmount: 29,
      status: "partial_refunded",
      provider: "tbc",
      providerPaymentId: "tbc-pay-5",
    },
    alreadyRefundedAmount: 29,
  });

  const result = await calculateRefundableAmount("pay_zero_left", {
    prismaClient: db as never,
  });
  assert.equal(result.remainingRefundableAmount, 0);
  assert.throws(
    () => assertRefundAmountAllowed(0.01, result.remainingRefundableAmount),
    (error: unknown) =>
      error instanceof BadRequestError && error.code === "REFUND_AMOUNT_EXCEEDS_REMAINING",
  );
}

{
  const remainingAfterThreeOfNine = 6;
  assert.doesNotThrow(() => assertRefundAmountAllowed(6, remainingAfterThreeOfNine));
  assert.throws(
    () => assertRefundAmountAllowed(6.01, remainingAfterThreeOfNine),
    (error: unknown) =>
      error instanceof BadRequestError && error.code === "REFUND_AMOUNT_EXCEEDS_REMAINING",
  );
}

// Source contracts: eligibility vs admin read separation; refunded not in allow-list
{
  const calcSrc = readFileSync(
    join(here, "calculate-refundable-amount.ts"),
    "utf8",
  );
  const refundService = readFileSync(join(here, "refund.service.ts"), "utf8");

  assert.match(calcSrc, /REFUNDABLE_PURCHASE_STATUSES/);
  assert.match(calcSrc, /"credited"/);
  assert.match(calcSrc, /"paid"/);
  assert.match(calcSrc, /"partial_refunded"/);
  // Must NOT widen eligibility to fully refunded purchases.
  const allowListBlock = calcSrc.slice(
    calcSrc.indexOf("REFUNDABLE_PURCHASE_STATUSES"),
    calcSrc.indexOf("export type RefundableAmountResult"),
  );
  assert.doesNotMatch(allowListBlock, /"refunded"/);

  assert.match(calcSrc, /export async function getAdminRefundableAmountSnapshot/);
  assert.match(calcSrc, /Must NOT be used for create\/approve eligibility/);

  assert.match(refundService, /getAdminRefundableAmountSnapshot/);
  const getAdminFn = refundService.slice(
    refundService.indexOf("export async function getRefundRequestForAdmin"),
    refundService.indexOf("export async function rejectRefundRequest"),
  );
  assert.match(getAdminFn, /getAdminRefundableAmountSnapshot/);
  assert.doesNotMatch(getAdminFn, /calculateRefundableAmount/);

  const createFn = refundService.slice(
    refundService.indexOf("export async function createRefundRequest"),
    refundService.indexOf("export async function listRefundRequestsForAdmin"),
  );
  assert.match(createFn, /calculateRefundableAmount/);
  assert.doesNotMatch(createFn, /getAdminRefundableAmountSnapshot/);

  const approveFn = refundService.slice(
    refundService.indexOf("export async function approveRefundRequest"),
    refundService.indexOf("export function assertNoClientUserIdIdentity"),
  );
  assert.match(approveFn, /calculateRefundableAmount/);
  assert.doesNotMatch(approveFn, /getAdminRefundableAmountSnapshot/);
}

console.log("refund-amount.contract.test.ts: ok");

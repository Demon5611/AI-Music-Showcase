import assert from "node:assert/strict";
import { processFlittRefundJob } from "./process-flitt-refund.js";
import type { NormalizedPayment, PaymentProvider } from "./payment-provider.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type RefundRow = {
  id: string;
  paymentId: string;
  amount: number | null;
  currency: string;
  status: string;
  provider: string;
  providerReference: string | null;
  providerError: string | null;
  userId?: string;
  scope?: string;
  cashRefundCreditUnits?: number | null;
  sourceSpendLedgerEntryId?: string | null;
};

function createDb(options: {
  refund: RefundRow;
  purchase: {
    id: string;
    provider: string;
    merchantPaymentId: string;
    priceAmount: number;
    userId?: string;
    creditsAmount?: number;
  };
  countedMajor?: number;
}) {
  let refund = { ...options.refund };
  const purchase = options.purchase;
  const updates: Array<Record<string, unknown>> = [];
  const countedMajor = options.countedMajor ?? Number(options.refund.amount ?? 0);

  const api = {
    updates,
    refundRequest: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === refund.id
          ? {
              ...refund,
              userId: purchase.userId ?? "user-1",
              paymentId: refund.paymentId,
              scope: refund.scope ?? "purchase_remainder",
              cashRefundCreditUnits: refund.cashRefundCreditUnits ?? null,
              sourceSpendLedgerEntryId: refund.sourceSpendLedgerEntryId ?? null,
            }
          : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status?: string | { in: string[] } };
        data: Record<string, unknown>;
      }) => {
        const allowed =
          typeof where.status === "string"
            ? [where.status]
            : where.status?.in ?? [refund.status];
        if (where.id !== refund.id || !allowed.includes(refund.status)) {
          return { count: 0 };
        }
        refund = { ...refund, ...data } as RefundRow;
        updates.push(data);
        return { count: 1 };
      },
      aggregate: async () => ({ _sum: { amount: countedMajor } }),
    },
    creditPackPurchase: {
      findUnique: async () => purchase,
      update: async () => purchase,
    },
    creditGrantLot: {
      findUnique: async () => null,
      findFirst: async () => null,
      update: async () => ({}),
    },
    creditTransaction: {
      findUnique: async () => null,
      create: async () => ({ id: "clawback-1" }),
      aggregate: async () => ({ _sum: { amountUnits: 0 } }),
    },
    $executeRaw: async () => 1,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(api),
  };

  return api;
}
function createProvider(payment: NormalizedPayment, refundImpl?: PaymentProvider["refund"]): PaymentProvider {
  return {
    providerId: "flitt",
    createCheckout: async () => {
      throw new Error("not used");
    },
    getPayment: async () => payment,
    refund: refundImpl ?? (async () => ({ providerReference: "rr-1" })),
  };
}

{
  const db = createDb({
    refund: {
      id: "rr-1",
      paymentId: "p-1",
      amount: 29,
      currency: "GEL",
      status: "approved",
      provider: "flitt",
      providerReference: null,
      providerError: null,
    },
    purchase: {
      id: "p-1",
      provider: "flitt",
      merchantPaymentId: "ord-1",
      priceAmount: 29,
    },
  });

  const result = await processFlittRefundJob(
    { refundRequestId: "rr-1" },
    {
      prismaClient: db as never,
      createProvider: () =>
        createProvider({
          provider: "flitt",
          providerPaymentId: "pay-1",
          orderId: "ord-1",
          merchantId: "1549901",
          amountMinor: 2900,
          currency: "GEL",
          reversalAmountMinor: 2900,
          providerStatus: "reversed",
          normalizedStatus: "refunded",
        }),
    },
  );

  assert.equal(result.outcome, "refunded");
}

{
  let refundCalls = 0;
  const db = createDb({
    refund: {
      id: "rr-2",
      paymentId: "p-2",
      amount: 29,
      currency: "GEL",
      status: "processing",
      provider: "flitt",
      providerReference: "rr-2",
      providerError: "ambiguous_reverse_attempted:network",
    },
    purchase: {
      id: "p-2",
      provider: "flitt",
      merchantPaymentId: "ord-2",
      priceAmount: 29,
    },
  });

  const result = await processFlittRefundJob(
    { refundRequestId: "rr-2" },
    {
      prismaClient: db as never,
      createProvider: () =>
        createProvider(
          {
            provider: "flitt",
            providerPaymentId: "pay-2",
            orderId: "ord-2",
            merchantId: "1549901",
            amountMinor: 2900,
            currency: "GEL",
            reversalAmountMinor: 0,
            providerStatus: "approved",
            normalizedStatus: "succeeded",
          },
          async () => {
            refundCalls += 1;
            return { providerReference: "rr-2" };
          },
        ),
    },
  );

  assert.equal(refundCalls, 1, "same reverse_id may be retried if GET shows no reversal");
  assert.ok(result.outcome === "refunded" || result.outcome === "retry");
}

/**
 * Invariant:
 * existing reversal_amount=300 + new requested 300 GEL-tetri (3.00)
 * with GET before reverse still showing 300
 * → MUST NOT treat the new refund as applied
 * → MUST call reverse
 * → after reconcile reversal_amount=600
 *
 * Buggy comparison reversal_amount >= this job's amount would skip reverse
 * and still mark RefundRequest refunded.
 */
{
  let reversalAmountMinor = 300;
  let refundCalls = 0;
  let reversalBeforeReverse: number | null = null;
  const db = createDb({
    refund: {
      id: "rr-partial-2",
      paymentId: "p-partial",
      amount: 3,
      currency: "GEL",
      status: "approved",
      provider: "flitt",
      providerReference: null,
      providerError: null,
    },
    purchase: {
      id: "p-partial",
      provider: "flitt",
      merchantPaymentId: "ord-partial",
      priceAmount: 9,
    },
    countedMajor: 6,
  });

  const result = await processFlittRefundJob(
    { refundRequestId: "rr-partial-2" },
    {
      prismaClient: db as never,
      createProvider: () => ({
        providerId: "flitt",
        createCheckout: async () => {
          throw new Error("not used");
        },
        getPayment: async () => ({
          provider: "flitt",
          providerPaymentId: "pay-partial",
          orderId: "ord-partial",
          merchantId: "1549901",
          amountMinor: 900,
          currency: "GEL",
          reversalAmountMinor,
          providerStatus: "approved",
          normalizedStatus: "succeeded",
        }),
        refund: async (input) => {
          reversalBeforeReverse = reversalAmountMinor;
          refundCalls += 1;
          assert.equal(input.amountMajor, 3);
          assert.equal(input.refundRequestId, "rr-partial-2");
          assert.equal(input.partial, true);
          reversalAmountMinor = 600;
          return { providerReference: "rr-partial-2" };
        },
      }),
    },
  );

  assert.equal(reversalBeforeReverse, 300, "GET before reverse must still show 300");
  assert.equal(refundCalls, 1, "new 300 refund must call reverse");
  assert.equal(reversalAmountMinor, 600, "after reconcile reversal_amount must be 600");
  assert.equal(result.outcome, "refunded");
}

{
  let refundCalls = 0;
  const db = createDb({
    refund: {
      id: "rr-partial-retry",
      paymentId: "p-partial-retry",
      amount: 3,
      currency: "GEL",
      status: "processing",
      provider: "flitt",
      providerReference: "rr-partial-retry",
      providerError: "ambiguous_reverse_attempted:network",
    },
    purchase: {
      id: "p-partial-retry",
      provider: "flitt",
      merchantPaymentId: "ord-partial-retry",
      priceAmount: 9,
    },
    countedMajor: 6,
  });

  const result = await processFlittRefundJob(
    { refundRequestId: "rr-partial-retry" },
    {
      prismaClient: db as never,
      createProvider: () =>
        createProvider(
          {
            provider: "flitt",
            providerPaymentId: "pay-partial-retry",
            orderId: "ord-partial-retry",
            merchantId: "1549901",
            amountMinor: 900,
            currency: "GEL",
            reversalAmountMinor: 300,
            providerStatus: "approved",
            normalizedStatus: "succeeded",
          },
          async () => {
            refundCalls += 1;
            return { providerReference: "rr-partial-retry" };
          },
        ),
    },
  );

  assert.equal(
    refundCalls,
    1,
    "ambiguous retry of a later partial must not needs_review only because reversal_amount > 0",
  );
  assert.notEqual(result.outcome, "needs_review");
}

{
  let refundCalls = 0;
  const db = createDb({
    refund: {
      id: "rr-same-job",
      paymentId: "p-same-job",
      amount: 3,
      currency: "GEL",
      status: "processing",
      provider: "flitt",
      providerReference: "rr-same-job",
      providerError: "awaiting_provider_status:approved",
    },
    purchase: {
      id: "p-same-job",
      provider: "flitt",
      merchantPaymentId: "ord-same-job",
      priceAmount: 9,
    },
    countedMajor: 3,
  });

  const result = await processFlittRefundJob(
    { refundRequestId: "rr-same-job" },
    {
      prismaClient: db as never,
      createProvider: () =>
        createProvider(
          {
            provider: "flitt",
            providerPaymentId: "pay-same-job",
            orderId: "ord-same-job",
            merchantId: "1549901",
            amountMinor: 900,
            currency: "GEL",
            reversalAmountMinor: 300,
            providerStatus: "approved",
            normalizedStatus: "succeeded",
          },
          async () => {
            refundCalls += 1;
            return { providerReference: "rr-same-job" };
          },
        ),
    },
  );

  assert.equal(refundCalls, 0, "repeat of the same partial must not reverse another 300");
  assert.equal(result.outcome, "refunded");
}

{
  const here = dirname(fileURLToPath(import.meta.url));
  const refundSource = readFileSync(join(here, "process-flitt-refund.ts"), "utf8");
  assert.doesNotMatch(refundSource, /getUsdGelQuote|FxRateProvider|convertUsdMajorToGel/);
  assert.match(refundSource, /releasePurchaseLotReservation/);
  assert.match(refundSource, /finalizeUserCashRefundLocalEffects/);
  assert.match(refundSource, /CreditClawbackInvariantError/);
  assert.doesNotMatch(refundSource, /amountUnits:\s*creditsToUnits/);
  const reviewIdx = refundSource.indexOf("async function markNeedsReview");
  const failedIdx = refundSource.indexOf("async function markFailed");
  const refundedIdx = refundSource.indexOf("async function markRefunded");
  const reviewFn = refundSource.slice(reviewIdx, failedIdx);
  const failedFn = refundSource.slice(failedIdx, refundedIdx);
  assert.doesNotMatch(reviewFn, /releasePurchaseLotReservation/);
  assert.match(failedFn, /releasePurchaseLotReservation/);
}

{
  let capturedMinor: number | undefined;
  let reversalAmountMinor = 0;
  const db = createDb({
    refund: {
      id: "rr-full-fx",
      paymentId: "p-full-fx",
      amount: 78.88,
      currency: "GEL",
      status: "approved",
      provider: "flitt",
      providerReference: null,
      providerError: null,
    },
    purchase: {
      id: "p-full-fx",
      provider: "flitt",
      merchantPaymentId: "ord-full-fx",
      priceAmount: 78.88,
    },
  });

  const result = await processFlittRefundJob(
    { refundRequestId: "rr-full-fx" },
    {
      prismaClient: db as never,
      createProvider: () => ({
        providerId: "flitt",
        createCheckout: async () => {
          throw new Error("refund must not create checkout");
        },
        getPayment: async () => ({
          provider: "flitt",
          providerPaymentId: "pay-full-fx",
          orderId: "ord-full-fx",
          merchantId: "1549901",
          amountMinor: 7888,
          currency: "GEL",
          reversalAmountMinor,
          providerStatus: reversalAmountMinor >= 7888 ? "reversed" : "approved",
          normalizedStatus: reversalAmountMinor >= 7888 ? "refunded" : "succeeded",
        }),
        refund: async (input) => {
          capturedMinor = input.amountMinor;
          assert.equal(input.amountMajor, 78.88);
          assert.equal(input.partial, false);
          reversalAmountMinor = 7888;
          return { providerReference: "rr-full-fx" };
        },
      }),
    },
  );

  assert.equal(capturedMinor, 7888);
  assert.equal(result.outcome, "refunded");
}

{
  let refundCalls = 0;
  const db = createDb({
    refund: {
      id: "rr-legacy-clawback",
      paymentId: "p-legacy-clawback",
      amount: 29,
      currency: "GEL",
      status: "processing",
      provider: "flitt",
      providerReference: "rr-legacy-clawback",
      providerError: null,
    },
    purchase: {
      id: "p-legacy-clawback",
      provider: "flitt",
      merchantPaymentId: "ord-legacy-clawback",
      priceAmount: 29,
      userId: "user-1",
      creditsAmount: 500,
    },
  });

  const result = await processFlittRefundJob(
    { refundRequestId: "rr-legacy-clawback" },
    {
      prismaClient: db as never,
      createProvider: () =>
        createProvider(
          {
            provider: "flitt",
            providerPaymentId: "pay-legacy-clawback",
            orderId: "ord-legacy-clawback",
            merchantId: "1549901",
            amountMinor: 2900,
            currency: "GEL",
            reversalAmountMinor: 2900,
            providerStatus: "reversed",
            normalizedStatus: "refunded",
          },
          async () => {
            refundCalls += 1;
            return { providerReference: "rr-legacy-clawback" };
          },
        ),
    },
  );

  assert.equal(result.outcome, "refunded");
  assert.equal(refundCalls, 0, "provider already refunded must not reverse again");
}

console.log("process-flitt-refund.unit.test.ts: ok");

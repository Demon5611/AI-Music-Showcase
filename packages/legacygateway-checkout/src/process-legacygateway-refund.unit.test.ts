/**
 * LEGACYGATEWAY refund processor unit tests with mocked provider + in-memory DB (no network).
 * Run: pnpm --filter @ai-music/legacygateway-checkout exec tsx src/process-legacygateway-refund.unit.test.ts
 */
import assert from "node:assert/strict";
import { LEGACYGATEWAY_PROVIDER_STATUSES } from "./legacygateway-status.js";
import {
  createRefundPaymentProviderFromEnv,
  resolveLegacygatewayRefundProviderMode,
  type RefundPaymentProvider,
} from "./refund-payment-provider.js";
import { MockLegacygatewayPaymentProvider } from "./mock-legacygateway-payment-provider.js";
import { LegacygatewayCheckoutError } from "./legacygateway-errors.js";
import type { LegacygatewayPaymentDetails } from "./legacygateway-client.js";
import type { LegacygatewayRefundInput } from "./legacygateway-payment-provider.js";
import { processLegacygatewayRefundJob } from "./process-legacygateway-refund.js";

// Contract: success statuses
assert.equal(LEGACYGATEWAY_PROVIDER_STATUSES.Returned, "Returned");
assert.equal(LEGACYGATEWAY_PROVIDER_STATUSES.PartialReturned, "PartialReturned");
assert.equal(LEGACYGATEWAY_PROVIDER_STATUSES.CancelPaymentProcessing, "CancelPaymentProcessing");

assert.equal(typeof processLegacygatewayRefundJob, "function");

// Factory returns mock without LEGACYGATEWAY HTTP when mode=mock
{
  const prevApp = process.env.APP_ENV;
  const prevMode = process.env.LEGACYGATEWAY_REFUND_PROVIDER_MODE;
  process.env.APP_ENV = "staging";
  process.env.LEGACYGATEWAY_REFUND_PROVIDER_MODE = "mock";
  assert.equal(resolveLegacygatewayRefundProviderMode(), "mock");
  const provider = createRefundPaymentProviderFromEnv();
  assert.ok(provider instanceof MockLegacygatewayPaymentProvider);
  assert.equal(provider.networkCallsToLegacygatewayBank, 0);
  process.env.APP_ENV = prevApp;
  process.env.LEGACYGATEWAY_REFUND_PROVIDER_MODE = prevMode;
}

type RefundRow = {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: string;
  providerReference: string | null;
  providerError: string | null;
  userId?: string;
  scope?: string;
  cashRefundCreditUnits?: number | null;
  sourceSpendLedgerEntryId?: string | null;
};

type PurchaseRow = {
  id: string;
  providerPaymentId: string;
  priceAmount: number;
  status: string;
  providerStatus: string | null;
  userId?: string;
  creditsAmount?: number;
};

function createMemoryRefundDb(seed: {
  refund: RefundRow;
  purchase: PurchaseRow;
}) {
  const refunds = new Map<string, RefundRow>([[seed.refund.id, { ...seed.refund }]]);
  const purchases = new Map<string, PurchaseRow>([
    [seed.purchase.id, { ...seed.purchase }],
  ]);

  type MemoryDb = {
    refundRequest: {
      findUnique: (args: { where: { id: string } }) => Promise<RefundRow | null>;
      updateMany: (args: {
        where: { id: string; status?: string | { in: string[] } };
        data: Partial<RefundRow>;
      }) => Promise<{ count: number }>;
      aggregate: (args: {
        where: { paymentId: string; status: string };
        _sum: { amount: true };
      }) => Promise<{ _sum: { amount: number } }>;
    };
    creditPackPurchase: {
      findUnique: (args: {
        where: { id: string };
        select?: { priceAmount: true; userId?: true; creditsAmount?: true };
      }) => Promise<PurchaseRow | { priceAmount: number; userId?: string; creditsAmount?: number } | null>;
      update: (args: {
        where: { id: string };
        data: Partial<PurchaseRow>;
      }) => Promise<PurchaseRow>;
    };
    creditGrantLot: {
      findUnique: (args: { where: { reservedRefundRequestId: string } }) => Promise<null>;
      findFirst: () => Promise<null>;
      update: () => Promise<Record<string, never>>;
    };
    creditTransaction: {
      findUnique: () => Promise<null>;
      create: () => Promise<{ id: string }>;
      aggregate: () => Promise<{ _sum: { amountUnits: number | null } }>;
    };
    $executeRaw: (...args: unknown[]) => Promise<number>;
    $transaction: <T>(fn: (tx: MemoryDb) => Promise<T>) => Promise<T>;
    _refunds: Map<string, RefundRow>;
    _purchases: Map<string, PurchaseRow>;
  };

  const api: MemoryDb = {
    refundRequest: {
      async findUnique(args) {
        const row = refunds.get(args.where.id);
        if (!row) {
          return null;
        }
        const purchase = purchases.get(row.paymentId);
        return {
          ...row,
          userId: row.userId ?? purchase?.userId ?? "u1",
          scope: row.scope ?? "purchase_remainder",
          cashRefundCreditUnits: row.cashRefundCreditUnits ?? null,
          sourceSpendLedgerEntryId: row.sourceSpendLedgerEntryId ?? null,
        };
      },
      async updateMany(args) {
        const row = refunds.get(args.where.id);
        if (!row) {
          return { count: 0 };
        }
        if (typeof args.where.status === "string") {
          if (row.status !== args.where.status) {
            return { count: 0 };
          }
        } else if (args.where.status && "in" in args.where.status) {
          if (!args.where.status.in.includes(row.status)) {
            return { count: 0 };
          }
        }
        Object.assign(row, args.data);
        return { count: 1 };
      },
      async aggregate(args) {
        let sum = 0;
        for (const row of refunds.values()) {
          if (
            row.paymentId === args.where.paymentId &&
            row.status === args.where.status
          ) {
            sum += row.amount;
          }
        }
        return { _sum: { amount: sum } };
      },
    },
    creditPackPurchase: {
      async findUnique(args) {
        const row = purchases.get(args.where.id);
        if (!row) {
          return null;
        }
        if (args.select?.priceAmount) {
          return {
            priceAmount: row.priceAmount,
            userId: "userId" in row ? row.userId : undefined,
            creditsAmount: "creditsAmount" in row ? row.creditsAmount : undefined,
          };
        }
        return { ...row };
      },
      async update(args) {
        const row = purchases.get(args.where.id);
        if (!row) {
          throw new Error("purchase missing");
        }
        Object.assign(row, args.data);
        return { ...row };
      },
    },
    creditGrantLot: {
      async findUnique() {
        return null;
      },
      async findFirst() {
        return null;
      },
      async update() {
        return {};
      },
    },
    creditTransaction: {
      async findUnique() {
        return null;
      },
      async create() {
        return { id: "clawback-1" };
      },
      async aggregate() {
        return { _sum: { amountUnits: 0 } };
      },
    },
    async $executeRaw() {
      return 1;
    },
    async $transaction(fn) {
      return fn(api);
    },
    _refunds: refunds,
    _purchases: purchases,
  };

  return api;
}

class ScriptedRefundProvider implements RefundPaymentProvider {
  refundCalls = 0;
  getPaymentDetailsCalls = 0;

  constructor(
    private readonly getStatuses: string[],
    private readonly refundMode: "success" | "ambiguous",
  ) {}

  async getPaymentDetails(providerPaymentId: string): Promise<LegacygatewayPaymentDetails> {
    this.getPaymentDetailsCalls += 1;
    const idx = Math.min(this.getPaymentDetailsCalls - 1, this.getStatuses.length - 1);
    const status = this.getStatuses[idx]!;
    return {
      payId: providerPaymentId.trim(),
      status,
      currency: "GEL",
      amount: 29,
      links: [],
    };
  }

  async refund(_input: LegacygatewayRefundInput): Promise<{ providerReference: string | null }> {
    this.refundCalls += 1;
    if (this.refundMode === "ambiguous") {
      throw new LegacygatewayCheckoutError("scripted_ambiguous_network", "network", {
        code: "LEGACYGATEWAY_SCRIPTED_AMBIGUOUS",
      });
    }
    return { providerReference: _input.refundRequestId };
  }
}

function seedApprovedRefund() {
  const refundId = "rr_idem_1";
  const paymentId = "pay_idem_1";
  return {
    refundId,
    paymentId,
    db: createMemoryRefundDb({
      refund: {
        id: refundId,
        paymentId,
        amount: 29,
        currency: "GEL",
        status: "approved",
        providerReference: null,
        providerError: null,
      },
      purchase: {
        id: paymentId,
        providerPaymentId: "legacygateway-pay-idem-1",
        priceAmount: 29,
        status: "credited",
        providerStatus: "Succeeded",
      },
    }),
  };
}

// Ambiguous cancel → GET in-flight → retry → next run must NOT refund again
{
  const { refundId, db } = seedApprovedRefund();
  const provider = new ScriptedRefundProvider(
    [
      // exec1 pre-cancel GET
      LEGACYGATEWAY_PROVIDER_STATUSES.Succeeded,
      // exec1 post-ambiguous reconcile GET
      LEGACYGATEWAY_PROVIDER_STATUSES.CancelPaymentProcessing,
      // exec2 pre-cancel GET (Succeeded — regression path without marker)
      LEGACYGATEWAY_PROVIDER_STATUSES.Succeeded,
    ],
    "ambiguous",
  );

  const first = await processLegacygatewayRefundJob(
    { refundRequestId: refundId },
    {
      createProvider: () => provider,
      prismaClient: db as never,
    },
  );
  assert.equal(first.outcome, "retry");
  assert.equal(provider.refundCalls, 1);

  const afterFirst = db._refunds.get(refundId)!;
  assert.equal(afterFirst.status, "processing");
  assert.ok(
    afterFirst.providerError?.startsWith("ambiguous_cancel_attempted:"),
    `expected ambiguous_cancel_attempted marker, got ${afterFirst.providerError}`,
  );

  const second = await processLegacygatewayRefundJob(
    { refundRequestId: refundId },
    {
      createProvider: () => provider,
      prismaClient: db as never,
    },
  );
  assert.equal(second.outcome, "needs_review");
  assert.equal(provider.refundCalls, 1, "second execution must not call refund()");
}

// Ambiguous cancel → GET in-flight → retry → subsequent still in-flight → no second cancel
{
  const { refundId, db } = seedApprovedRefund();
  const provider = new ScriptedRefundProvider(
    [
      LEGACYGATEWAY_PROVIDER_STATUSES.Succeeded,
      LEGACYGATEWAY_PROVIDER_STATUSES.CancelPaymentProcessing,
      LEGACYGATEWAY_PROVIDER_STATUSES.CancelPaymentProcessing,
    ],
    "ambiguous",
  );

  const first = await processLegacygatewayRefundJob(
    { refundRequestId: refundId },
    {
      createProvider: () => provider,
      prismaClient: db as never,
    },
  );
  assert.equal(first.outcome, "retry");
  assert.equal(provider.refundCalls, 1);

  const second = await processLegacygatewayRefundJob(
    { refundRequestId: refundId },
    {
      createProvider: () => provider,
      prismaClient: db as never,
    },
  );
  assert.equal(second.outcome, "retry");
  assert.equal(provider.refundCalls, 1);
}

// Successful cancel → GET in-flight → retry → subsequent Succeeded must not send second cancel
{
  const { refundId, db } = seedApprovedRefund();
  const provider = new ScriptedRefundProvider(
    [
      // exec1 pre-cancel
      LEGACYGATEWAY_PROVIDER_STATUSES.Succeeded,
      // exec1 post-cancel
      LEGACYGATEWAY_PROVIDER_STATUSES.CancelPaymentProcessing,
      // exec2 reconcile — still Succeeded (not yet Returned)
      LEGACYGATEWAY_PROVIDER_STATUSES.Succeeded,
    ],
    "success",
  );

  const first = await processLegacygatewayRefundJob(
    { refundRequestId: refundId },
    {
      createProvider: () => provider,
      prismaClient: db as never,
    },
  );
  assert.equal(first.outcome, "retry");
  assert.equal(provider.refundCalls, 1);

  const afterFirst = db._refunds.get(refundId)!;
  assert.equal(afterFirst.providerReference, refundId);

  const second = await processLegacygatewayRefundJob(
    { refundRequestId: refundId },
    {
      createProvider: () => provider,
      prismaClient: db as never,
    },
  );
  assert.equal(second.outcome, "needs_review");
  assert.equal(provider.refundCalls, 1, "successful-cancel retry must not refund again");
}

// Source contract: ambiguous path persists marker before retry return
{
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "process-legacygateway-refund.ts"), "utf8");
  assert.match(src, /ambiguous_cancel_attempted:/);
  assert.match(src, /persistAmbiguousCancelAttempted/);
  const ambiguousBlock = src.slice(
    src.indexOf("Ambiguous: do not blind-retry cancel"),
    src.indexOf("if (error instanceof LegacygatewayCheckoutError && error.kind === \"validation\")"),
  );
  const persistIdx = ambiguousBlock.indexOf("persistAmbiguousCancelAttempted");
  const inFlightRetryIdx = ambiguousBlock.indexOf(
    "cancel_payment_processing_after_error",
  );
  assert.ok(persistIdx >= 0 && inFlightRetryIdx > persistIdx);
  assert.match(src, /CreditClawbackInvariantError/);
  assert.doesNotMatch(src, /amountUnits:\s*creditsToUnits/);
  const reviewIdx = src.indexOf("async function markNeedsReview");
  const failedIdx = src.indexOf("async function markFailed");
  const refundedIdx = src.indexOf("async function markRefunded");
  assert.doesNotMatch(src.slice(reviewIdx, failedIdx), /releasePurchaseLotReservation/);
  assert.match(src.slice(failedIdx, refundedIdx), /releasePurchaseLotReservation/);
}

{
  const refundId = "rr_legacy_no_lot";
  const paymentId = "pay_legacy_no_lot";
  const db = createMemoryRefundDb({
    refund: {
      id: refundId,
      paymentId,
      amount: 29,
      currency: "GEL",
      status: "processing",
      providerReference: refundId,
      providerError: null,
    },
    purchase: {
      id: paymentId,
      providerPaymentId: "legacygateway-pay-legacy-1",
      priceAmount: 29,
      status: "credited",
      providerStatus: "Succeeded",
      userId: "u1",
      creditsAmount: 500,
    },
  });
  const provider = new ScriptedRefundProvider([LEGACYGATEWAY_PROVIDER_STATUSES.Returned], "success");
  const result = await processLegacygatewayRefundJob(
    { refundRequestId: refundId },
    {
      createProvider: () => provider,
      prismaClient: db as never,
    },
  );
  assert.equal(result.outcome, "refunded");
  assert.equal(provider.refundCalls, 0, "provider already refunded must not reverse again");
  assert.equal(db._refunds.get(refundId)?.status, "refunded");
}

console.log("process-legacygateway-refund.unit.test.ts: ok");

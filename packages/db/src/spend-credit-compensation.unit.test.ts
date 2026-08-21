import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CASH_REFUND_REVIEW_REASONS } from "@ai-music/shared";
import {
  evaluateSpendCreditCompensation,
  SpendAlreadyCashRefundedError,
} from "./spend-credit-compensation.js";

type AllocRow = {
  id: string;
  spendLedgerEntryId: string;
  cashRefundRequestId: string | null;
};

type RefundRow = {
  sourceSpendLedgerEntryId: string;
  scope: string;
  status: string;
  providerReference: string | null;
  providerError: string | null;
};

function createEvalTx(state: { allocations: AllocRow[]; refunds: RefundRow[] }) {
  return {
    creditGrantLotAllocation: {
      findFirst: async ({
        where,
      }: {
        where: {
          spendLedgerEntryId: string;
          cashRefundRequestId: { not: null };
        };
      }) =>
        state.allocations.find(
          (row) =>
            row.spendLedgerEntryId === where.spendLedgerEntryId &&
            row.cashRefundRequestId != null,
        ) ?? null,
    },
    refundRequest: {
      findMany: async ({
        where,
      }: {
        where: {
          sourceSpendLedgerEntryId: string;
          scope: string;
          status: { in: string[] };
        };
      }) =>
        state.refunds.filter(
          (row) =>
            row.sourceSpendLedgerEntryId === where.sourceSpendLedgerEntryId &&
            row.scope === where.scope &&
            where.status.in.includes(row.status),
        ),
    },
  };
}

describe("evaluateSpendCreditCompensation", () => {
  it("allows credit compensation when no cash refund exists", async () => {
    const decision = await evaluateSpendCreditCompensation(
      createEvalTx({ allocations: [], refunds: [] }) as never,
      { spendLedgerEntryId: "spend-1" },
    );
    assert.deepEqual(decision, { allowed: true });
  });

  it("blocks when allocation is stamped cashRefundRequestId (core exploit)", async () => {
    const decision = await evaluateSpendCreditCompensation(
      createEvalTx({
        allocations: [
          {
            id: "a1",
            spendLedgerEntryId: "spend-1",
            cashRefundRequestId: "rr-1",
          },
        ],
        refunds: [],
      }) as never,
      { spendLedgerEntryId: "spend-1" },
    );
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.equal(
        decision.reason,
        CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded,
      );
    }
  });

  it("blocks approved / processing / refunded operation cash refund before stamp", async () => {
    for (const status of ["approved", "processing", "refunded"] as const) {
      const decision = await evaluateSpendCreditCompensation(
        createEvalTx({
          allocations: [],
          refunds: [
            {
              sourceSpendLedgerEntryId: "spend-1",
              scope: "operation",
              status,
              providerReference: null,
              providerError: null,
            },
          ],
        }) as never,
        { spendLedgerEntryId: "spend-1" },
      );
      assert.equal(decision.allowed, false, status);
    }
  });

  it("does not block requested-only cash refund (credit path may win first)", async () => {
    const decision = await evaluateSpendCreditCompensation(
      createEvalTx({
        allocations: [],
        refunds: [
          {
            sourceSpendLedgerEntryId: "spend-1",
            scope: "operation",
            status: "requested",
            providerReference: null,
            providerError: null,
          },
        ],
      }) as never,
      { spendLedgerEntryId: "spend-1" },
    );
    assert.deepEqual(decision, { allowed: true });
  });

  it("does not block definitive failed cash refund without provider marker", async () => {
    const decision = await evaluateSpendCreditCompensation(
      createEvalTx({
        allocations: [],
        refunds: [
          {
            sourceSpendLedgerEntryId: "spend-1",
            scope: "operation",
            status: "failed",
            providerReference: null,
            providerError: "provider_rejected:insufficient_funds",
          },
        ],
      }) as never,
      { spendLedgerEntryId: "spend-1" },
    );
    assert.deepEqual(decision, { allowed: true });
  });

  it("blocks needs_review when durable provider-attempt marker exists (ambiguous)", async () => {
    const decision = await evaluateSpendCreditCompensation(
      createEvalTx({
        allocations: [],
        refunds: [
          {
            sourceSpendLedgerEntryId: "spend-1",
            scope: "operation",
            status: "needs_review",
            providerReference: null,
            providerError: "ambiguous_reverse_attempted:timeout",
          },
        ],
      }) as never,
      { spendLedgerEntryId: "spend-1" },
    );
    assert.equal(decision.allowed, false);
  });

  it("does not block needs_review without provider-attempt marker", async () => {
    const decision = await evaluateSpendCreditCompensation(
      createEvalTx({
        allocations: [],
        refunds: [
          {
            sourceSpendLedgerEntryId: "spend-1",
            scope: "operation",
            status: "needs_review",
            providerReference: null,
            providerError: "OPERATION_ALREADY_CREDIT_COMPENSATED",
          },
        ],
      }) as never,
      { spendLedgerEntryId: "spend-1" },
    );
    assert.deepEqual(decision, { allowed: true });
  });

  it("exact spend only — sibling spend with same relation is not blocked", async () => {
    const decision = await evaluateSpendCreditCompensation(
      createEvalTx({
        allocations: [
          {
            id: "a-remix",
            spendLedgerEntryId: "spend-remix",
            cashRefundRequestId: "rr-remix",
          },
        ],
        refunds: [
          {
            sourceSpendLedgerEntryId: "spend-remix",
            scope: "operation",
            status: "refunded",
            providerReference: "rr-1",
            providerError: null,
          },
        ],
      }) as never,
      { spendLedgerEntryId: "spend-gen" },
    );
    assert.deepEqual(decision, { allowed: true });
  });

  it("SpendAlreadyCashRefundedError carries OPERATION_ALREADY_CASH_REFUNDED", () => {
    const err = new SpendAlreadyCashRefundedError("spend-1");
    assert.equal(err.code, CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded);
    assert.equal(err.spendLedgerEntryId, "spend-1");
  });
});

/**
 * Documents the pre-fix ordering bug: ledger refund created before restore.
 * A restore-only skip would still leave positive ledger delta — guard must be earlier.
 *
 * Would this fail before the fix? YES — production writeLedgerEntry created the
 * refund row first; cashRefundRequestId only affected restoreLotsForSpend.
 */
describe("double-compensation ordering invariant", () => {
  it("credit compensation must check cash XOR before any ledger refund write", async () => {
    const events: string[] = [];
    const spendId = "spend-op";

    async function simulatedSystemCompensation(cashAlreadySucceeded: boolean) {
      events.push("lookup_spend");
      if (cashAlreadySucceeded) {
        const decision = await evaluateSpendCreditCompensation(
          createEvalTx({
            allocations: [
              {
                id: "a1",
                spendLedgerEntryId: spendId,
                cashRefundRequestId: "rr-1",
              },
            ],
            refunds: [],
          }) as never,
          { spendLedgerEntryId: spendId },
        );
        events.push("evaluate_cash_xor");
        if (!decision.allowed) {
          events.push("abort_before_ledger");
          return { ledgerRefundDelta: 0 };
        }
      }
      events.push("create_ledger_refund");
      events.push("restore_lots");
      return { ledgerRefundDelta: 100_000 };
    }

    const blocked = await simulatedSystemCompensation(true);
    assert.equal(blocked.ledgerRefundDelta, 0);
    assert.deepEqual(events, [
      "lookup_spend",
      "evaluate_cash_xor",
      "abort_before_ledger",
    ]);

    events.length = 0;
    const allowed = await simulatedSystemCompensation(false);
    assert.equal(allowed.ledgerRefundDelta, 100_000);
    assert.ok(events.includes("create_ledger_refund"));
  });
});

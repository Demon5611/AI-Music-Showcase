import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  consumeLotsForSpend,
  ensureLotForGrant,
  finalizeCreditPackRefundClawback,
  planCreditPackRefundClawback,
  planFifoLotConsumption,
  reservePurchaseLotForRefund,
  resolveExactSpendLedgerEntryId,
  restoreLotsForSpend,
  spendableBalanceUnits,
  unlottedBalanceUnits,
  type ReservedLotForClawback,
} from "./credit-grant-lots.js";

describe("credit grant lots FIFO", () => {
  const demo = {
    id: "demo",
    grantAmountUnits: 50_000,
    remainingAmountUnits: 50_000,
    reservedAmountUnits: 0,
    createdAt: new Date("2026-01-01"),
  };
  const pack = {
    id: "pack",
    grantAmountUnits: 500_000,
    remainingAmountUnits: 500_000,
    reservedAmountUnits: 0,
    createdAt: new Date("2026-08-19"),
  };

  it("consumes older unlotted then older lots first", () => {
    const plan = planFifoLotConsumption([pack, demo], 0, 1_000);
    assert.ok(plan);
    assert.equal(plan.unlottedUsedUnits, 0);
    assert.deepEqual(plan.draws, [{ lotId: "demo", amountUnits: 1_000 }]);
  });

  it("still consumes lots that carry legacy reservedAmountUnits", () => {
    const reservedPack = { ...pack, reservedAmountUnits: 500_000 };
    const plan = planFifoLotConsumption([demo, reservedPack], 0, 1_000);
    assert.ok(plan);
    assert.deepEqual(plan.draws, [{ lotId: "demo", amountUnits: 1_000 }]);
  });

  it("can spend from a lot with legacy reservedAmountUnits", () => {
    const reservedPack = { ...pack, reservedAmountUnits: 500_000 };
    const plan = planFifoLotConsumption([reservedPack], 0, 1_000);
    assert.ok(plan);
    assert.deepEqual(plan.draws, [{ lotId: "pack", amountUnits: 1_000 }]);
  });

  it("spendable balance equals ledger total (reservation ignored)", () => {
    assert.equal(spendableBalanceUnits(550_000, 500_000), 550_000);
    assert.equal(unlottedBalanceUnits(550_000, 500_000), 50_000);
  });
});

describe("planCreditPackRefundClawback", () => {
  const reserved: ReservedLotForClawback = {
    id: "lot-1",
    userId: "user-1",
    sourcePurchaseId: "purchase-1",
    status: "reserved",
    reservedRefundRequestId: "rr-1",
    reservedAmountUnits: 500_000,
    remainingAmountUnits: 500_000,
  };
  const ids = { userId: "user-1", purchaseId: "purchase-1", refundRequestId: "rr-1" };

  it("uses reserved amount, never a caller pack size", () => {
    const plan = planCreditPackRefundClawback({ ...ids, lot: reserved, existingClawback: null });
    assert.deepEqual(plan, { action: "apply", clawbackAmountUnits: 500_000 });
  });

  it("skips credit debit when lot is missing (no reservation-based clawback)", () => {
    const plan = planCreditPackRefundClawback({ ...ids, lot: null, existingClawback: null });
    assert.deepEqual(plan, {
      action: "idempotent_success",
      clawbackAmountUnits: 0,
      markLotClawed: false,
    });
  });

  it("rejects another user's lot", () => {
    const plan = planCreditPackRefundClawback({
      ...ids,
      lot: { ...reserved, userId: "other" },
      existingClawback: null,
    });
    assert.equal(plan.action, "invariant_violation");
    if (plan.action === "invariant_violation") {
      assert.equal(plan.detail, "lot_user_mismatch");
    }
  });

  it("skips debit when reservation belongs to a different refund request", () => {
    const plan = planCreditPackRefundClawback({
      ...ids,
      lot: { ...reserved, reservedRefundRequestId: "rr-other" },
      existingClawback: null,
    });
    assert.deepEqual(plan, {
      action: "idempotent_success",
      clawbackAmountUnits: 0,
      markLotClawed: false,
    });
  });

  it("rejects remaining below reserved for legacy reserved lots", () => {
    const plan = planCreditPackRefundClawback({
      ...ids,
      lot: { ...reserved, remainingAmountUnits: 400_000 },
      existingClawback: null,
    });
    assert.equal(plan.action, "invariant_violation");
    if (plan.action === "invariant_violation") {
      assert.equal(plan.detail, "remaining_below_reserved");
    }
  });

  it("rejects clawed lot without a ledger clawback", () => {
    const plan = planCreditPackRefundClawback({
      ...ids,
      lot: { ...reserved, status: "clawed", reservedRefundRequestId: null, reservedAmountUnits: 0 },
      existingClawback: null,
    });
    assert.equal(plan.action, "invariant_violation");
    if (plan.action === "invariant_violation") {
      assert.equal(plan.detail, "lot_clawed_without_ledger");
    }
  });

  it("treats clawed lot plus existing ledger as idempotent success", () => {
    const plan = planCreditPackRefundClawback({
      ...ids,
      lot: { ...reserved, status: "clawed" },
      existingClawback: { id: "cb-1" },
    });
    assert.equal(plan.action, "idempotent_success");
  });

  it("skips debit for open unreserved lot (no freeze pipeline)", () => {
    const plan = planCreditPackRefundClawback({
      ...ids,
      lot: { ...reserved, status: "open", reservedRefundRequestId: null, reservedAmountUnits: 0 },
      existingClawback: null,
    });
    assert.deepEqual(plan, {
      action: "idempotent_success",
      clawbackAmountUnits: 0,
      markLotClawed: false,
    });
  });
});

type FakeLedgerRow = {
  id: string;
  userId: string;
  amountUnits: number;
  idempotencyKey: string | null;
};

type FakeLot = ReservedLotForClawback & { createdAt: Date; grantAmountUnits?: number };

function createFakeClawbackTx(state: { lots: FakeLot[]; ledger: FakeLedgerRow[] }) {
  return {
    async $executeRaw() {
      return 1;
    },
    creditGrantLot: {
      findFirst: async ({ where }: { where: { sourcePurchaseId: string } }) =>
        state.lots.find((lot) => lot.sourcePurchaseId === where.sourcePurchaseId) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeLot>;
      }) => {
        const lot = state.lots.find((row) => row.id === where.id);
        if (!lot) {
          throw new Error("lot missing");
        }
        Object.assign(lot, data);
        return lot;
      },
    },
    creditTransaction: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        state.ledger.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null,
      aggregate: async ({ where }: { where: { userId: string } }) => ({
        _sum: {
          amountUnits: state.ledger
            .filter((row) => row.userId === where.userId)
            .reduce((sum, row) => sum + row.amountUnits, 0),
        },
      }),
      create: async ({ data }: { data: Omit<FakeLedgerRow, "id"> & { type?: string } }) => {
        const row: FakeLedgerRow = {
          id: `tx-${state.ledger.length + 1}`,
          userId: data.userId,
          amountUnits: data.amountUnits,
          idempotencyKey: data.idempotencyKey,
        };
        state.ledger.push(row);
        return row;
      },
    },
  };
}

describe("finalizeCreditPackRefundClawback", () => {
  const laterGrant: FakeLedgerRow = {
    id: "later-grant",
    userId: "user-1",
    amountUnits: 100_000,
    idempotencyKey: "later",
  };

  function reservedLot(): FakeLot {
    return {
      id: "lot-1",
      userId: "user-1",
      sourcePurchaseId: "purchase-1",
      status: "reserved",
      reservedRefundRequestId: "rr-1",
      reservedAmountUnits: 500_000,
      remainingAmountUnits: 500_000,
      createdAt: new Date("2026-08-01"),
    };
  }

  it("claws back exactly the reserved 500 units", async () => {
    const lot = reservedLot();
    const state = {
      lots: [lot],
      ledger: [{ id: "grant", userId: "user-1", amountUnits: 500_000, idempotencyKey: "grant" }],
    };
    const result = await finalizeCreditPackRefundClawback(createFakeClawbackTx(state) as never, {
      userId: "user-1",
      purchaseId: "purchase-1",
      refundRequestId: "rr-1",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.clawbackAmountUnits, 500_000);
    }
    assert.equal(state.ledger.at(-1)?.amountUnits, -500_000);
    assert.equal(lot.status, "clawed");
    assert.equal(lot.reservedAmountUnits, 0);
    assert.equal(lot.reservedRefundRequestId, null);
    assert.equal(
      state.ledger.reduce((sum, row) => sum + row.amountUnits, 0),
      0,
    );
  });

  it("ignores a caller-provided 1000-credit amount and still claws reserved 500", async () => {
    const lot = reservedLot();
    const state = {
      lots: [lot],
      ledger: [{ id: "grant", userId: "user-1", amountUnits: 500_000, idempotencyKey: "grant" }],
    };
    const result = await finalizeCreditPackRefundClawback(createFakeClawbackTx(state) as never, {
      userId: "user-1",
      purchaseId: "purchase-1",
      refundRequestId: "rr-1",
      amountUnits: 1_000_000,
    } as never);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.clawbackAmountUnits, 500_000);
    }
    assert.equal(state.ledger.filter((row) => row.amountUnits < 0).length, 1);
    assert.equal(state.ledger.at(-1)?.amountUnits, -500_000);
  });

  it("creates zero debit when the lot is missing", async () => {
    const state = {
      lots: [] as FakeLot[],
      ledger: [{ id: "grant", userId: "user-1", amountUnits: 500_000, idempotencyKey: "grant" }],
    };
    const result = await finalizeCreditPackRefundClawback(createFakeClawbackTx(state) as never, {
      userId: "user-1",
      purchaseId: "purchase-1",
      refundRequestId: "rr-1",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.clawbackAmountUnits, 0);
    }
    assert.equal(state.ledger.length, 1);
  });

  it("creates zero debit when the lot belongs to another user", async () => {
    const lot = { ...reservedLot(), userId: "other" };
    const state = {
      lots: [lot],
      ledger: [{ id: "grant", userId: "user-1", amountUnits: 500_000, idempotencyKey: "grant" }],
    };
    const result = await finalizeCreditPackRefundClawback(createFakeClawbackTx(state) as never, {
      userId: "user-1",
      purchaseId: "purchase-1",
      refundRequestId: "rr-1",
    });
    assert.equal(result.ok, false);
    assert.equal(state.ledger.length, 1);
    assert.equal(lot.status, "reserved");
  });

  it("creates zero debit when reserved for another refund request", async () => {
    const lot = { ...reservedLot(), reservedRefundRequestId: "rr-other" };
    const state = { lots: [lot], ledger: [{ id: "g", userId: "user-1", amountUnits: 500_000, idempotencyKey: "g" }] };
    const result = await finalizeCreditPackRefundClawback(createFakeClawbackTx(state) as never, {
      userId: "user-1",
      purchaseId: "purchase-1",
      refundRequestId: "rr-1",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.clawbackAmountUnits, 0);
    }
    assert.equal(state.ledger.length, 1);
  });

  it("creates zero debit when remaining is below reserved", async () => {
    const lot = { ...reservedLot(), remainingAmountUnits: 100_000 };
    const state = { lots: [lot], ledger: [{ id: "g", userId: "user-1", amountUnits: 500_000, idempotencyKey: "g" }] };
    const result = await finalizeCreditPackRefundClawback(createFakeClawbackTx(state) as never, {
      userId: "user-1",
      purchaseId: "purchase-1",
      refundRequestId: "rr-1",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.detail, "remaining_below_reserved");
    }
    assert.equal(state.ledger.length, 1);
  });

  it("creates zero debit when aggregate balance is below reserved", async () => {
    const lot = reservedLot();
    const state = { lots: [lot], ledger: [{ id: "g", userId: "user-1", amountUnits: 100_000, idempotencyKey: "g" }] };
    const result = await finalizeCreditPackRefundClawback(createFakeClawbackTx(state) as never, {
      userId: "user-1",
      purchaseId: "purchase-1",
      refundRequestId: "rr-1",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.detail, "insufficient_ledger_balance");
    }
    assert.equal(state.ledger.length, 1);
    assert.equal(lot.status, "reserved");
  });

  it("does not consume a newer grant to cover the clawback", async () => {
    const lot = reservedLot();
    const laterLot: FakeLot = {
      id: "lot-2",
      userId: "user-1",
      sourcePurchaseId: "purchase-2",
      status: "open",
      reservedRefundRequestId: null,
      reservedAmountUnits: 0,
      remainingAmountUnits: 100_000,
      createdAt: new Date("2026-08-19"),
    };
    const state = {
      lots: [lot, laterLot],
      ledger: [
        { id: "g1", userId: "user-1", amountUnits: 500_000, idempotencyKey: "g1" },
        laterGrant,
      ],
    };
    const result = await finalizeCreditPackRefundClawback(createFakeClawbackTx(state) as never, {
      userId: "user-1",
      purchaseId: "purchase-1",
      refundRequestId: "rr-1",
    });
    assert.equal(result.ok, true);
    assert.equal(laterLot.status, "open");
    assert.equal(laterLot.remainingAmountUnits, 100_000);
    assert.equal(
      state.ledger.reduce((sum, row) => sum + row.amountUnits, 0),
      100_000,
    );
  });

  it("leaves balance unchanged for a legacy in-flight refund without reservation", async () => {
    const lot = { ...reservedLot(), status: "open", reservedRefundRequestId: null, reservedAmountUnits: 0 };
    const state = { lots: [lot], ledger: [{ id: "g", userId: "user-1", amountUnits: 500_000, idempotencyKey: "g" }] };
    const result = await finalizeCreditPackRefundClawback(createFakeClawbackTx(state) as never, {
      userId: "user-1",
      purchaseId: "purchase-1",
      refundRequestId: "rr-1",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.clawbackAmountUnits, 0);
    }
    assert.equal(state.ledger.length, 1);
    assert.equal(lot.status, "open");
  });

  it("writes a single ledger clawback on duplicate finalize", async () => {
    const lot = reservedLot();
    const state = { lots: [lot], ledger: [{ id: "g", userId: "user-1", amountUnits: 500_000, idempotencyKey: "g" }] };
    const tx = createFakeClawbackTx(state);
    const first = await finalizeCreditPackRefundClawback(tx as never, {
      userId: "user-1",
      purchaseId: "purchase-1",
      refundRequestId: "rr-1",
    });
    const second = await finalizeCreditPackRefundClawback(tx as never, {
      userId: "user-1",
      purchaseId: "purchase-1",
      refundRequestId: "rr-1",
    });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (second.ok) {
      assert.equal(second.alreadyApplied, true);
    }
    assert.equal(state.ledger.filter((row) => row.amountUnits < 0).length, 1);
  });
});

type RestoreAlloc = {
  id: string;
  lotId: string;
  spendLedgerEntryId: string;
  amountUnits: number;
  restoredAt: Date | null;
  cashRefundRequestId?: string | null;
};

function createRestoreTx(state: {
  lots: FakeLot[];
  allocations: RestoreAlloc[];
  spends: Array<{ id: string; userId: string; type: string; idempotencyKey: string }>;
}) {
  return {
    creditGrantLotAllocation: {
      findMany: async ({ where }: { where: { spendLedgerEntryId: string } }) =>
        state.allocations.filter((row) => row.spendLedgerEntryId === where.spendLedgerEntryId),
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          restoredAt: null;
          cashRefundRequestId?: null;
        };
        data: { restoredAt: Date };
      }) => {
        const row = state.allocations.find((item) => item.id === where.id);
        if (!row || row.restoredAt !== null) {
          return { count: 0 };
        }
        if (
          where.cashRefundRequestId === null &&
          row.cashRefundRequestId != null
        ) {
          return { count: 0 };
        }
        row.restoredAt = data.restoredAt;
        return { count: 1 };
      },
    },
    creditGrantLot: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.lots.find((lot) => lot.id === where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { remainingAmountUnits?: { increment: number } };
      }) => {
        const lot = state.lots.find((item) => item.id === where.id);
        if (!lot) {
          throw new Error("lot missing");
        }
        if (data.remainingAmountUnits?.increment) {
          lot.remainingAmountUnits += data.remainingAmountUnits.increment;
        }
        return lot;
      },
    },
    creditTransaction: {
      findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
        state.spends.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null,
    },
  };
}

describe("restoreLotsForSpend exact ledger id", () => {
  function packLot(remaining: number): FakeLot {
    return {
      id: "lot-pack",
      userId: "user-1",
      sourcePurchaseId: "purchase-1",
      status: "open",
      reservedRefundRequestId: null,
      reservedAmountUnits: 0,
      grantAmountUnits: 500_000,
      remainingAmountUnits: remaining,
      createdAt: new Date("2026-08-01"),
    };
  }

  it("restores only the exact spend C when A/B/C share a relation tuple", async () => {
    const lot = packLot(250_000);
    const allocations: RestoreAlloc[] = [
      { id: "alloc-a", lotId: lot.id, spendLedgerEntryId: "spend-gen", amountUnits: 100_000, restoredAt: null },
      { id: "alloc-b", lotId: lot.id, spendLedgerEntryId: "spend-remix", amountUnits: 100_000, restoredAt: null },
      { id: "alloc-c", lotId: lot.id, spendLedgerEntryId: "spend-cover", amountUnits: 50_000, restoredAt: null },
    ];
    const tx = createRestoreTx({ lots: [lot], allocations, spends: [] });
    await restoreLotsForSpend(tx as never, "spend-cover");

    assert.equal(lot.remainingAmountUnits, 300_000);
    assert.equal(allocations[0]?.restoredAt, null);
    assert.equal(allocations[1]?.restoredAt, null);
    assert.ok(allocations[2]?.restoredAt);
  });

  it("does not restore generation allocation when album-cover refunds the same related tuple", async () => {
    const lot = packLot(350_000);
    const allocations: RestoreAlloc[] = [
      { id: "alloc-gen", lotId: lot.id, spendLedgerEntryId: "spend-gen", amountUnits: 100_000, restoredAt: null },
      { id: "alloc-cover", lotId: lot.id, spendLedgerEntryId: "spend-cover", amountUnits: 50_000, restoredAt: null },
    ];
    await restoreLotsForSpend(
      createRestoreTx({ lots: [lot], allocations, spends: [] }) as never,
      "spend-cover",
    );

    assert.equal(lot.remainingAmountUnits, 400_000);
    assert.equal(allocations[0]?.restoredAt, null);
    assert.ok(allocations[1]?.restoredAt);
    assert.notEqual(lot.remainingAmountUnits, lot.grantAmountUnits);
  });

  it("duplicate restore of one spend does not increment remaining twice", async () => {
    const lot = packLot(400_000);
    const allocations: RestoreAlloc[] = [
      { id: "alloc-c", lotId: lot.id, spendLedgerEntryId: "spend-cover", amountUnits: 50_000, restoredAt: null },
    ];
    const tx = createRestoreTx({ lots: [lot], allocations, spends: [] });
    await restoreLotsForSpend(tx as never, "spend-cover");
    await restoreLotsForSpend(tx as never, "spend-cover");
    assert.equal(lot.remainingAmountUnits, 450_000);
    assert.ok(allocations[0]?.restoredAt);
  });

  it("concurrent restore of the same spend claims allocation once", async () => {
    const lot = packLot(400_000);
    const allocations: RestoreAlloc[] = [
      { id: "alloc-c", lotId: lot.id, spendLedgerEntryId: "spend-cover", amountUnits: 50_000, restoredAt: null },
    ];
    const tx = createRestoreTx({ lots: [lot], allocations, spends: [] });
    await Promise.all([
      restoreLotsForSpend(tx as never, "spend-cover"),
      restoreLotsForSpend(tx as never, "spend-cover"),
    ]);
    assert.equal(lot.remainingAmountUnits, 450_000);
  });

  it("a later refund of another spend restores only that spend", async () => {
    const lot = packLot(250_000);
    const allocations: RestoreAlloc[] = [
      { id: "alloc-a", lotId: lot.id, spendLedgerEntryId: "spend-gen", amountUnits: 100_000, restoredAt: null },
      { id: "alloc-c", lotId: lot.id, spendLedgerEntryId: "spend-cover", amountUnits: 50_000, restoredAt: null },
    ];
    const tx = createRestoreTx({ lots: [lot], allocations, spends: [] });
    await restoreLotsForSpend(tx as never, "spend-cover");
    await restoreLotsForSpend(tx as never, "spend-gen");
    assert.equal(lot.remainingAmountUnits, 400_000);
    assert.ok(allocations[0]?.restoredAt);
    assert.ok(allocations[1]?.restoredAt);
  });

  it("never restores allocations stamped with cashRefundRequestId", async () => {
    const lot = packLot(420_000);
    const allocations: RestoreAlloc[] = [
      {
        id: "alloc-paid",
        lotId: lot.id,
        spendLedgerEntryId: "spend-op",
        amountUnits: 80_000,
        restoredAt: null,
        cashRefundRequestId: "rr-cash-1",
      },
    ];
    const tx = createRestoreTx({ lots: [lot], allocations, spends: [] });
    await restoreLotsForSpend(tx as never, "spend-op");
    assert.equal(lot.remainingAmountUnits, 420_000);
    assert.equal(allocations[0]?.restoredAt, null);
    assert.equal(allocations[0]?.cashRefundRequestId, "rr-cash-1");
  });

  it("mixed free+paid cash-refunded spend restores nothing (not even free)", async () => {
    const paidLot = packLot(420_000);
    const freeLot: FakeLot = {
      id: "lot-free",
      userId: "user-1",
      sourcePurchaseId: null,
      status: "open",
      reservedRefundRequestId: null,
      reservedAmountUnits: 0,
      grantAmountUnits: 50_000,
      remainingAmountUnits: 30_000,
      createdAt: new Date("2026-08-01"),
    };
    const allocations: RestoreAlloc[] = [
      {
        id: "alloc-free",
        lotId: freeLot.id,
        spendLedgerEntryId: "spend-mixed",
        amountUnits: 20_000,
        restoredAt: null,
        cashRefundRequestId: "rr-cash-1",
      },
      {
        id: "alloc-paid",
        lotId: paidLot.id,
        spendLedgerEntryId: "spend-mixed",
        amountUnits: 80_000,
        restoredAt: null,
        cashRefundRequestId: "rr-cash-1",
      },
    ];
    const tx = createRestoreTx({
      lots: [paidLot, freeLot],
      allocations,
      spends: [],
    });
    await restoreLotsForSpend(tx as never, "spend-mixed");
    assert.equal(paidLot.remainingAmountUnits, 420_000);
    assert.equal(freeLot.remainingAmountUnits, 30_000);
    assert.equal(allocations[0]?.restoredAt, null);
    assert.equal(allocations[1]?.restoredAt, null);
  });

  it("cash-refunded operation units do not inflate purchase remainder", async () => {
    // Pack 500k; spent 80k paid then cash-refunded → remaining stays 420k (not 500k).
    const lot = packLot(420_000);
    const allocations: RestoreAlloc[] = [
      {
        id: "alloc-op",
        lotId: lot.id,
        spendLedgerEntryId: "spend-op",
        amountUnits: 80_000,
        restoredAt: null,
        cashRefundRequestId: "rr-op",
      },
    ];
    await restoreLotsForSpend(
      createRestoreTx({ lots: [lot], allocations, spends: [] }) as never,
      "spend-op",
    );
    assert.equal(lot.remainingAmountUnits, 420_000);
    assert.notEqual(lot.remainingAmountUnits, lot.grantAmountUnits);
  });

  it("fail-closed lookup requires an exact spend idempotency key", async () => {
    const tx = createRestoreTx({
      lots: [],
      allocations: [],
      spends: [
        { id: "spend-gen", userId: "user-1", type: "spend", idempotencyKey: "generation:g1:spend" },
        { id: "spend-cover", userId: "user-1", type: "spend", idempotencyKey: "album_cover:g1:spend" },
      ],
    });
    assert.equal(
      await resolveExactSpendLedgerEntryId(tx as never, { userId: "user-1" }),
      null,
    );
    assert.equal(
      await resolveExactSpendLedgerEntryId(tx as never, {
        userId: "user-1",
        sourceSpendIdempotencyKey: "album_cover:g1:spend",
      }),
      "spend-cover",
    );
    assert.equal(
      await resolveExactSpendLedgerEntryId(tx as never, {
        userId: "other",
        sourceSpendIdempotencyKey: "album_cover:g1:spend",
      }),
      null,
    );
  });
});

describe("ensureLotForGrant", () => {
  it("creates at most one lot per source ledger grant", async () => {
    const lots: Array<{ sourceLedgerEntryId: string }> = [];
    const tx = {
      creditGrantLot: {
        findUnique: async ({ where }: { where: { sourceLedgerEntryId: string } }) =>
          lots.find((row) => row.sourceLedgerEntryId === where.sourceLedgerEntryId) ?? null,
        create: async ({ data }: { data: { sourceLedgerEntryId: string } }) => {
          lots.push({ sourceLedgerEntryId: data.sourceLedgerEntryId });
          return data;
        },
      },
    };
    const grant = {
      id: "grant-1",
      userId: "user-1",
      amountUnits: 500_000,
      relatedEntityType: "credit_pack_purchase",
      relatedEntityId: "purchase-1",
      createdAt: new Date("2026-08-19"),
    };
    await ensureLotForGrant(tx as never, grant);
    await ensureLotForGrant(tx as never, grant);
    assert.equal(lots.length, 1);
  });
});

describe("reservePurchaseLotForRefund", () => {
  function openLot() {
    return {
      id: "lot-1",
      userId: "user-1",
      sourcePurchaseId: "purchase-1",
      status: "open",
      reservedAmountUnits: 0,
      reservedRefundRequestId: null,
      remainingAmountUnits: 500_000,
      grantAmountUnits: 500_000,
    };
  }

  function createReserveTx(lot: {
    id: string;
    userId: string;
    sourcePurchaseId: string;
    status: string;
    reservedAmountUnits: number;
    reservedRefundRequestId: string | null;
    remainingAmountUnits: number;
    grantAmountUnits: number;
  } | null) {
    return {
      lot,
      creditGrantLot: {
        findFirst: async ({ where }: { where: { sourcePurchaseId: string; userId: string } }) => {
          if (!lot) {
            return null;
          }
          if (lot.sourcePurchaseId !== where.sourcePurchaseId || lot.userId !== where.userId) {
            return null;
          }
          return lot;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; status: string; reservedAmountUnits: number };
          data: Record<string, unknown>;
        }) => {
          if (!lot || lot.id !== where.id || lot.status !== "open" || lot.reservedAmountUnits !== 0) {
            return { count: 0 };
          }
          Object.assign(lot, data);
          return { count: 1 };
        },
      },
    };
  }

  it("reserves only a full unused lot owned by the user", async () => {
    const lot = openLot();
    await reservePurchaseLotForRefund(createReserveTx(lot) as never, {
      purchaseId: "purchase-1",
      refundRequestId: "rr-1",
      userId: "user-1",
    });
    assert.equal(lot.status, "reserved");
    assert.equal(lot.reservedAmountUnits, 500_000);
    assert.equal(lot.reservedRefundRequestId, "rr-1");
  });

  it("refuses a partially consumed lot", async () => {
    const lot = { ...openLot(), remainingAmountUnits: 499_000 };
    await assert.rejects(
      () =>
        reservePurchaseLotForRefund(createReserveTx(lot) as never, {
          purchaseId: "purchase-1",
          refundRequestId: "rr-1",
          userId: "user-1",
        }),
      /CREDIT_LOT_NOT_RESERVABLE/,
    );
    assert.equal(lot.status, "open");
  });

  it("refuses to rebind an already reserved lot", async () => {
    const lot = { ...openLot(), status: "reserved", reservedAmountUnits: 500_000, reservedRefundRequestId: "rr-old" };
    await assert.rejects(
      () =>
        reservePurchaseLotForRefund(createReserveTx(lot) as never, {
          purchaseId: "purchase-1",
          refundRequestId: "rr-new",
          userId: "user-1",
        }),
      /CREDIT_LOT_NOT_RESERVABLE/,
    );
  });
});

describe("consumeLotsForSpend", () => {
  it("FIFO prefers older open lots before later lots with legacy reserved flags", async () => {
    const lots = [
      {
        id: "demo",
        grantAmountUnits: 50_000,
        remainingAmountUnits: 50_000,
        reservedAmountUnits: 0,
        createdAt: new Date("2026-01-01"),
        status: "open",
      },
      {
        id: "pack",
        grantAmountUnits: 500_000,
        remainingAmountUnits: 500_000,
        reservedAmountUnits: 500_000,
        createdAt: new Date("2026-08-19"),
        status: "reserved",
      },
    ];
    const allocations: Array<{ lotId: string; spendLedgerEntryId: string; amountUnits: number }> = [];
    const tx = {
      creditGrantLot: {
        findMany: async () => lots,
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; remainingAmountUnits: { gte: number } };
          data: { remainingAmountUnits: { decrement: number } };
        }) => {
          const lot = lots.find((row) => row.id === where.id);
          if (!lot || lot.remainingAmountUnits < where.remainingAmountUnits.gte) {
            return { count: 0 };
          }
          lot.remainingAmountUnits -= data.remainingAmountUnits.decrement;
          return { count: 1 };
        },
      },
      creditGrantLotAllocation: {
        create: async ({ data }: { data: { lotId: string; spendLedgerEntryId: string; amountUnits: number } }) => {
          allocations.push(data);
          return data;
        },
      },
    };

    await consumeLotsForSpend(tx as never, {
      userId: "user-1",
      spendId: "spend-1",
      amountUnits: 1_000,
      ledgerBalanceBeforeSpend: 550_000,
    });

    assert.equal(lots[0]?.remainingAmountUnits, 49_000);
    assert.equal(lots[1]?.remainingAmountUnits, 500_000);
    assert.deepEqual(allocations, [{ lotId: "demo", spendLedgerEntryId: "spend-1", amountUnits: 1_000 }]);
  });

  it("fails instead of decrementing remaining below zero", async () => {
    const lots = [
      {
        id: "pack",
        grantAmountUnits: 500_000,
        remainingAmountUnits: 500,
        reservedAmountUnits: 0,
        createdAt: new Date("2026-08-19"),
        status: "open",
      },
    ];
    const tx = {
      creditGrantLot: {
        findMany: async () => lots,
        updateMany: async () => ({ count: 0 }),
      },
      creditGrantLotAllocation: {
        create: async () => {
          throw new Error("must not allocate");
        },
      },
    };

    await assert.rejects(
      () =>
        consumeLotsForSpend(tx as never, {
          userId: "user-1",
          spendId: "spend-1",
          amountUnits: 1_000,
          ledgerBalanceBeforeSpend: 500,
        }),
      /CREDIT_LOT_CONSUME_FAILED/,
    );
  });
});

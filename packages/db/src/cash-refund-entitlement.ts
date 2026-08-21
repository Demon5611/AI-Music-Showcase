import type { Prisma } from "@prisma/client";
import {
  CASH_REFUND_REVIEW_REASONS,
  computeCumulativeCashRefundMinor,
  majorDecimalStringToMinorUnits,
  minorUnitsToMajorDecimalString,
  REFUND_MONEY_COUNTED_STATUSES,
  type CashRefundScope,
} from "@ai-music/shared";

type Tx = Prisma.TransactionClient;

export type CashRefundEntitlementOk = {
  ok: true;
  scope: CashRefundScope;
  paymentId: string;
  userId: string;
  currency: string;
  grantedCreditUnits: number;
  cashRefundCreditUnits: number;
  alreadyRefundedCreditUnits: number;
  originalAmountMinor: bigint;
  incrementalAmountMinor: bigint;
  amountMajor: string;
  sourceSpendLedgerEntryId: string | null;
  allocationIds: string[];
};

export type CashRefundEntitlementFailure = {
  ok: false;
  reason: string;
};

export type CashRefundEntitlementResult = CashRefundEntitlementOk | CashRefundEntitlementFailure;

async function alreadyMonetizedCreditUnits(tx: Tx, paymentId: string): Promise<number> {
  const agg = await tx.refundRequest.aggregate({
    where: {
      paymentId,
      status: { in: [...REFUND_MONEY_COUNTED_STATUSES] },
      cashRefundCreditUnits: { not: null },
    },
    _sum: { cashRefundCreditUnits: true },
  });
  return agg._sum.cashRefundCreditUnits ?? 0;
}

function buildMoney(input: {
  priceAmount: { toString(): string } | string | number;
  grantedCreditUnits: number;
  alreadyRefundedCreditUnits: number;
  thisRefundCreditUnits: number;
}): Pick<
  CashRefundEntitlementOk,
  "originalAmountMinor" | "incrementalAmountMinor" | "amountMajor"
> {
  const originalAmountMinor = majorDecimalStringToMinorUnits(
    typeof input.priceAmount === "string" || typeof input.priceAmount === "number"
      ? String(input.priceAmount)
      : input.priceAmount.toString(),
  );
  const { incrementalRefundMinor } = computeCumulativeCashRefundMinor({
    originalAmountMinor,
    grantedCreditUnits: input.grantedCreditUnits,
    alreadyRefundedCreditUnits: input.alreadyRefundedCreditUnits,
    thisRefundCreditUnits: input.thisRefundCreditUnits,
  });
  if (incrementalRefundMinor <= 0n) {
    throw new Error("incremental refund minor must be positive");
  }
  return {
    originalAmountMinor,
    incrementalAmountMinor: incrementalRefundMinor,
    amountMajor: minorUnitsToMajorDecimalString(incrementalRefundMinor),
  };
}

/**
 * Purchase remainder: unused paid lot units for one CreditPackPurchase.
 */
export async function resolvePurchaseRemainderCashRefund(
  tx: Tx,
  input: { userId: string; paymentId: string },
): Promise<CashRefundEntitlementResult> {
  const purchase = await tx.creditPackPurchase.findUnique({
    where: { id: input.paymentId },
    select: {
      id: true,
      userId: true,
      currency: true,
      priceAmount: true,
      creditsAmount: true,
    },
  });
  if (!purchase || purchase.userId !== input.userId) {
    return { ok: false, reason: "PURCHASE_NOT_FOUND" };
  }

  const lot = await tx.creditGrantLot.findFirst({
    where: { sourcePurchaseId: purchase.id, userId: input.userId },
    orderBy: { createdAt: "asc" },
  });
  if (!lot) {
    return { ok: false, reason: CASH_REFUND_REVIEW_REASONS.lotMissing };
  }

  const grantedCreditUnits = lot.grantAmountUnits;
  const remaining = Math.max(0, lot.remainingAmountUnits);
  const already = await alreadyMonetizedCreditUnits(tx, purchase.id);
  const room = Math.max(0, grantedCreditUnits - already);
  const cashRefundCreditUnits = Math.min(remaining, room);

  if (cashRefundCreditUnits <= 0) {
    return { ok: false, reason: CASH_REFUND_REVIEW_REASONS.purchaseRemainderZero };
  }

  try {
    const money = buildMoney({
      priceAmount: purchase.priceAmount,
      grantedCreditUnits,
      alreadyRefundedCreditUnits: already,
      thisRefundCreditUnits: cashRefundCreditUnits,
    });
    return {
      ok: true,
      scope: "purchase_remainder",
      paymentId: purchase.id,
      userId: purchase.userId,
      currency: purchase.currency,
      grantedCreditUnits,
      cashRefundCreditUnits,
      alreadyRefundedCreditUnits: already,
      sourceSpendLedgerEntryId: null,
      allocationIds: [],
      ...money,
    };
  } catch {
    return { ok: false, reason: CASH_REFUND_REVIEW_REASONS.purchaseRemainderZero };
  }
}

/**
 * Operation cash refund: paid allocations of an exact spend ledger row.
 */
export async function resolveOperationCashRefund(
  tx: Tx,
  input: { userId: string; sourceSpendLedgerEntryId: string },
): Promise<CashRefundEntitlementResult> {
  const spend = await tx.creditTransaction.findUnique({
    where: { id: input.sourceSpendLedgerEntryId },
    select: { id: true, userId: true, type: true, amountUnits: true },
  });
  if (!spend || spend.userId !== input.userId || spend.type !== "spend") {
    return { ok: false, reason: "SPEND_NOT_FOUND" };
  }

  const existingCash = await tx.refundRequest.findFirst({
    where: {
      sourceSpendLedgerEntryId: spend.id,
      status: { in: [...REFUND_MONEY_COUNTED_STATUSES] },
    },
    select: { id: true },
  });
  if (existingCash) {
    return { ok: false, reason: CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded };
  }

  const allocations = await tx.creditGrantLotAllocation.findMany({
    where: { spendLedgerEntryId: spend.id },
    include: {
      lot: {
        select: {
          id: true,
          sourcePurchaseId: true,
          grantAmountUnits: true,
          userId: true,
        },
      },
    },
  });

  if (allocations.some((row) => row.restoredAt != null)) {
    return { ok: false, reason: CASH_REFUND_REVIEW_REASONS.operationAlreadyCreditCompensated };
  }
  if (allocations.some((row) => row.cashRefundRequestId != null)) {
    return { ok: false, reason: CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded };
  }

  const paid = allocations.filter((row) => row.lot.sourcePurchaseId != null);
  if (paid.length === 0) {
    return { ok: false, reason: CASH_REFUND_REVIEW_REASONS.operationNoPaidCredits };
  }

  const purchaseIds = [...new Set(paid.map((row) => row.lot.sourcePurchaseId!))];
  if (purchaseIds.length !== 1) {
    return { ok: false, reason: CASH_REFUND_REVIEW_REASONS.operationSpansMultiplePurchases };
  }

  const paymentId = purchaseIds[0]!;
  const purchase = await tx.creditPackPurchase.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      userId: true,
      currency: true,
      priceAmount: true,
    },
  });
  if (!purchase || purchase.userId !== input.userId) {
    return { ok: false, reason: "PURCHASE_NOT_FOUND" };
  }

  const lot = await tx.creditGrantLot.findFirst({
    where: { sourcePurchaseId: paymentId, userId: input.userId },
    orderBy: { createdAt: "asc" },
  });
  if (!lot) {
    return { ok: false, reason: CASH_REFUND_REVIEW_REASONS.lotMissing };
  }

  const cashRefundCreditUnits = paid.reduce((sum, row) => sum + row.amountUnits, 0);
  if (cashRefundCreditUnits <= 0) {
    return { ok: false, reason: CASH_REFUND_REVIEW_REASONS.operationNoPaidCredits };
  }

  const already = await alreadyMonetizedCreditUnits(tx, paymentId);
  if (already + cashRefundCreditUnits > lot.grantAmountUnits) {
    return { ok: false, reason: CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded };
  }

  try {
    const money = buildMoney({
      priceAmount: purchase.priceAmount,
      grantedCreditUnits: lot.grantAmountUnits,
      alreadyRefundedCreditUnits: already,
      thisRefundCreditUnits: cashRefundCreditUnits,
    });
    return {
      ok: true,
      scope: "operation",
      paymentId: purchase.id,
      userId: purchase.userId,
      currency: purchase.currency,
      grantedCreditUnits: lot.grantAmountUnits,
      cashRefundCreditUnits,
      alreadyRefundedCreditUnits: already,
      sourceSpendLedgerEntryId: spend.id,
      allocationIds: paid.map((row) => row.id),
      ...money,
    };
  } catch {
    return { ok: false, reason: CASH_REFUND_REVIEW_REASONS.operationNoPaidCredits };
  }
}

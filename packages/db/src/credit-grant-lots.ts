import type { Prisma } from "@prisma/client";

export type CreditGrantLotSnapshot = {
  id: string;
  grantAmountUnits: number;
  remainingAmountUnits: number;
  reservedAmountUnits: number;
  createdAt: Date;
};

export type LotDraw = {
  lotId: string;
  amountUnits: number;
};

export type LotConsumptionPlan = {
  unlottedUsedUnits: number;
  draws: LotDraw[];
};

export function lotAvailableUnits(lot: {
  remainingAmountUnits: number;
  reservedAmountUnits?: number;
}): number {
  // Refund reservation fields are legacy/inert for spend — remaining is spendable.
  void lot.reservedAmountUnits;
  return Math.max(0, lot.remainingAmountUnits);
}

export function unlottedBalanceUnits(
  ledgerBalanceUnits: number,
  lotsRemainingSum: number,
): number {
  return Math.max(0, ledgerBalanceUnits - lotsRemainingSum);
}

/**
 * @deprecated Refund reservation must not reduce spendable credits.
 * Prefer ledger balance directly. Kept for callers/tests; ignores reservedSum.
 */
export function spendableBalanceUnits(
  ledgerBalanceUnits: number,
  reservedSum: number,
): number {
  void reservedSum;
  return Math.max(0, ledgerBalanceUnits);
}

export function planFifoLotConsumption(
  lots: CreditGrantLotSnapshot[],
  unlottedUnits: number,
  amountUnits: number,
): LotConsumptionPlan | null {
  if (amountUnits <= 0) {
    return null;
  }

  let remaining = amountUnits;
  const unlottedUsedUnits = Math.min(unlottedUnits, remaining);
  remaining -= unlottedUsedUnits;

  const draws: LotDraw[] = [];
  const ordered = [...lots].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const lot of ordered) {
    if (remaining <= 0) {
      break;
    }
    const take = Math.min(lotAvailableUnits(lot), remaining);
    if (take <= 0) {
      continue;
    }
    draws.push({ lotId: lot.id, amountUnits: take });
    remaining -= take;
  }

  if (remaining > 0) {
    return null;
  }

  return { unlottedUsedUnits, draws };
}

type LotTx = Prisma.TransactionClient;

export async function ensureLotForGrant(
  tx: LotTx,
  grant: {
    id: string;
    userId: string;
    amountUnits: number;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    createdAt: Date;
  },
): Promise<void> {
  if (grant.amountUnits <= 0) {
    return;
  }

  const existing = await tx.creditGrantLot.findUnique({
    where: { sourceLedgerEntryId: grant.id },
    select: { id: true },
  });
  if (existing) {
    return;
  }

  const sourcePurchaseId =
    grant.relatedEntityType === "credit_pack_purchase" ? grant.relatedEntityId : null;

  await tx.creditGrantLot.create({
    data: {
      userId: grant.userId,
      sourcePurchaseId,
      sourceLedgerEntryId: grant.id,
      grantAmountUnits: grant.amountUnits,
      remainingAmountUnits: grant.amountUnits,
      reservedAmountUnits: 0,
      status: "open",
      createdAt: grant.createdAt,
    },
  });
}

export async function reservedUnitsForUser(tx: LotTx, userId: string): Promise<number> {
  const agg = await tx.creditGrantLot.aggregate({
    where: { userId },
    _sum: { reservedAmountUnits: true },
  });
  return agg._sum.reservedAmountUnits ?? 0;
}

async function loadLots(tx: LotTx, userId: string): Promise<CreditGrantLotSnapshot[]> {
  const rows = await tx.creditGrantLot.findMany({
    where: { userId, status: { not: "clawed" } },
    orderBy: { createdAt: "asc" },
    select: {
      grantAmountUnits: true,
      remainingAmountUnits: true,
      reservedAmountUnits: true,
      createdAt: true,
      id: true,
    },
  });
  return rows;
}

export async function consumeLotsForSpend(
  tx: LotTx,
  input: { userId: string; spendId: string; amountUnits: number; ledgerBalanceBeforeSpend: number },
): Promise<void> {
  const lots = await loadLots(tx, input.userId);
  const remainingSum = lots.reduce((sum, lot) => sum + lot.remainingAmountUnits, 0);
  const unlotted = unlottedBalanceUnits(input.ledgerBalanceBeforeSpend, remainingSum);
  const plan = planFifoLotConsumption(lots, unlotted, input.amountUnits);
  if (!plan) {
    throw new Error("CREDIT_LOT_CONSUME_FAILED");
  }

  for (const draw of plan.draws) {
    const consumed = await tx.creditGrantLot.updateMany({
      where: {
        id: draw.lotId,
        status: { not: "clawed" },
        remainingAmountUnits: { gte: draw.amountUnits },
      },
      data: {
        remainingAmountUnits: { decrement: draw.amountUnits },
      },
    });
    if (consumed.count !== 1) {
      throw new Error("CREDIT_LOT_CONSUME_FAILED");
    }
    await tx.creditGrantLotAllocation.create({
      data: {
        lotId: draw.lotId,
        spendLedgerEntryId: input.spendId,
        amountUnits: draw.amountUnits,
      },
    });
  }
}

export async function restoreLotsForSpend(tx: LotTx, spendLedgerEntryId: string): Promise<void> {
  const allocations = await tx.creditGrantLotAllocation.findMany({
    where: { spendLedgerEntryId },
  });

  const now = new Date();
  for (const allocation of allocations) {
    if (allocation.restoredAt) {
      continue;
    }
    // Monetarily refunded operation units stay spent; never restore or clear marker.
    if (allocation.cashRefundRequestId != null) {
      continue;
    }

    const claimed = await tx.creditGrantLotAllocation.updateMany({
      where: {
        id: allocation.id,
        restoredAt: null,
        cashRefundRequestId: null,
      },
      data: { restoredAt: now },
    });
    if (claimed.count !== 1) {
      continue;
    }

    const lot = await tx.creditGrantLot.findUnique({
      where: { id: allocation.lotId },
      select: { id: true, status: true },
    });
    if (!lot || lot.status === "clawed") {
      continue;
    }

    await tx.creditGrantLot.update({
      where: { id: lot.id },
      data: {
        remainingAmountUnits: { increment: allocation.amountUnits },
      },
    });
  }
}

export async function resolveExactSpendLedgerEntryId(
  tx: LotTx,
  input: { userId: string; sourceSpendIdempotencyKey?: string },
): Promise<string | null> {
  const key = input.sourceSpendIdempotencyKey?.trim();
  if (!key) {
    return null;
  }

  const spend = await tx.creditTransaction.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, userId: true, type: true },
  });

  if (!spend || spend.type !== "spend" || spend.userId !== input.userId) {
    return null;
  }

  return spend.id;
}

export async function reservePurchaseLotForRefund(
  tx: LotTx,
  input: { purchaseId: string; refundRequestId: string; userId: string },
): Promise<void> {
  const lot = await tx.creditGrantLot.findFirst({
    where: { sourcePurchaseId: input.purchaseId, userId: input.userId },
    orderBy: { createdAt: "asc" },
  });
  if (!lot) {
    throw new Error("CREDIT_LOT_MISSING");
  }

  if (
    lot.status !== "open" ||
    lot.reservedAmountUnits !== 0 ||
    lot.reservedRefundRequestId != null ||
    lot.remainingAmountUnits !== lot.grantAmountUnits
  ) {
    throw new Error("CREDIT_LOT_NOT_RESERVABLE");
  }

  const reserved = await tx.creditGrantLot.updateMany({
    where: {
      id: lot.id,
      userId: input.userId,
      status: "open",
      reservedAmountUnits: 0,
      reservedRefundRequestId: null,
      remainingAmountUnits: lot.grantAmountUnits,
    },
    data: {
      reservedAmountUnits: lot.remainingAmountUnits,
      reservedRefundRequestId: input.refundRequestId,
      status: "reserved",
    },
  });
  if (reserved.count !== 1) {
    throw new Error("CREDIT_LOT_NOT_RESERVABLE");
  }
}

export async function releasePurchaseLotReservation(
  tx: LotTx,
  refundRequestId: string,
): Promise<void> {
  const lot = await tx.creditGrantLot.findUnique({
    where: { reservedRefundRequestId: refundRequestId },
  });
  if (!lot || lot.status === "clawed") {
    return;
  }

  await tx.creditGrantLot.update({
    where: { id: lot.id },
    data: {
      reservedAmountUnits: 0,
      reservedRefundRequestId: null,
      status: "open",
    },
  });
}

export const CREDIT_CLAWBACK_INVARIANT_VIOLATION = "CREDIT_CLAWBACK_INVARIANT_VIOLATION";

export class CreditClawbackInvariantError extends Error {
  readonly code = CREDIT_CLAWBACK_INVARIANT_VIOLATION;

  constructor(readonly detail: string) {
    super(`${CREDIT_CLAWBACK_INVARIANT_VIOLATION}:${detail}`);
    this.name = "CreditClawbackInvariantError";
  }
}

export type ReservedLotForClawback = {
  id: string;
  userId: string;
  sourcePurchaseId: string | null;
  status: string;
  reservedRefundRequestId: string | null;
  reservedAmountUnits: number;
  remainingAmountUnits: number;
};

export type ClawbackFinalizeOk = {
  ok: true;
  clawbackAmountUnits: number;
  alreadyApplied: boolean;
};

export type ClawbackFinalizeFailure = {
  ok: false;
  reason: typeof CREDIT_CLAWBACK_INVARIANT_VIOLATION;
  detail: string;
};

export type ClawbackFinalizeResult = ClawbackFinalizeOk | ClawbackFinalizeFailure;

export type ClawbackLotPlan =
  | { action: "idempotent_success"; clawbackAmountUnits: number; markLotClawed: boolean }
  | { action: "apply"; clawbackAmountUnits: number }
  | { action: "invariant_violation"; detail: string };

function clawbackIdempotencyKey(refundRequestId: string): string {
  return `credit_pack_refund_clawback:${refundRequestId}`;
}

export function planCreditPackRefundClawback(input: {
  userId: string;
  purchaseId: string;
  refundRequestId: string;
  lot: ReservedLotForClawback | null;
  existingClawback: { id: string } | null;
}): ClawbackLotPlan {
  const lot = input.lot;

  if (input.existingClawback) {
    if (!lot) {
      return { action: "idempotent_success", clawbackAmountUnits: 0, markLotClawed: false };
    }
    if (lot.status === "clawed" && lot.userId === input.userId && lot.sourcePurchaseId === input.purchaseId) {
      return { action: "idempotent_success", clawbackAmountUnits: 0, markLotClawed: false };
    }
    if (
      lot.userId === input.userId &&
      lot.sourcePurchaseId === input.purchaseId &&
      lot.reservedRefundRequestId === input.refundRequestId
    ) {
      return {
        action: "idempotent_success",
        clawbackAmountUnits: lot.reservedAmountUnits,
        markLotClawed: lot.status !== "clawed",
      };
    }
    return { action: "idempotent_success", clawbackAmountUnits: 0, markLotClawed: false };
  }

  // No lot / no reservation for this refund → monetary finalize without credit debit.
  // Explicit post-refund credit policy is a separate product decision; do not invent
  // a new auto-debit amount here.
  if (!lot) {
    return { action: "idempotent_success", clawbackAmountUnits: 0, markLotClawed: false };
  }
  if (lot.userId !== input.userId) {
    return { action: "invariant_violation", detail: "lot_user_mismatch" };
  }
  if (lot.sourcePurchaseId !== input.purchaseId) {
    return { action: "invariant_violation", detail: "lot_purchase_mismatch" };
  }
  if (lot.status === "clawed") {
    return { action: "invariant_violation", detail: "lot_clawed_without_ledger" };
  }

  // Legacy path only: reservation-based clawback when a reserved lot still exists.
  if (
    lot.status === "reserved" &&
    lot.reservedRefundRequestId === input.refundRequestId &&
    lot.reservedAmountUnits > 0
  ) {
    if (lot.remainingAmountUnits < lot.reservedAmountUnits) {
      return { action: "invariant_violation", detail: "remaining_below_reserved" };
    }
    return { action: "apply", clawbackAmountUnits: lot.reservedAmountUnits };
  }

  return { action: "idempotent_success", clawbackAmountUnits: 0, markLotClawed: false };
}

async function markLotClawed(tx: LotTx, lotId: string): Promise<void> {
  await tx.creditGrantLot.update({
    where: { id: lotId },
    data: {
      remainingAmountUnits: 0,
      reservedAmountUnits: 0,
      reservedRefundRequestId: null,
      status: "clawed",
    },
  });
}

export async function finalizeCreditPackRefundClawback(
  tx: LotTx,
  input: {
    userId: string;
    purchaseId: string;
    refundRequestId: string;
  },
): Promise<ClawbackFinalizeResult> {
  const existing = await tx.creditTransaction.findUnique({
    where: { idempotencyKey: clawbackIdempotencyKey(input.refundRequestId) },
    select: { id: true },
  });

  const lot = await tx.creditGrantLot.findFirst({
    where: { sourcePurchaseId: input.purchaseId },
    orderBy: { createdAt: "asc" },
  });

  const plan = planCreditPackRefundClawback({
    userId: input.userId,
    purchaseId: input.purchaseId,
    refundRequestId: input.refundRequestId,
    lot,
    existingClawback: existing,
  });

  if (plan.action === "invariant_violation") {
    return {
      ok: false,
      reason: CREDIT_CLAWBACK_INVARIANT_VIOLATION,
      detail: plan.detail,
    };
  }

  if (plan.action === "idempotent_success") {
    if (plan.markLotClawed && lot) {
      await markLotClawed(tx, lot.id);
    }
    return {
      ok: true,
      clawbackAmountUnits: plan.clawbackAmountUnits,
      alreadyApplied: true,
    };
  }

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.userId})::bigint)`;

  const balance = await tx.creditTransaction.aggregate({
    where: { userId: input.userId },
    _sum: { amountUnits: true },
  });
  const ledgerBalanceUnits = balance._sum.amountUnits ?? 0;
  if (ledgerBalanceUnits < plan.clawbackAmountUnits) {
    return {
      ok: false,
      reason: CREDIT_CLAWBACK_INVARIANT_VIOLATION,
      detail: "insufficient_ledger_balance",
    };
  }

  await tx.creditTransaction.create({
    data: {
      userId: input.userId,
      type: "clawback",
      amountUnits: -plan.clawbackAmountUnits,
      reason: `credit_pack_refund_clawback:${input.purchaseId}`,
      idempotencyKey: clawbackIdempotencyKey(input.refundRequestId),
      relatedEntityType: "credit_pack_purchase",
      relatedEntityId: input.purchaseId,
    },
  });

  if (lot) {
    await markLotClawed(tx, lot.id);
  }

  return {
    ok: true,
    clawbackAmountUnits: plan.clawbackAmountUnits,
    alreadyApplied: false,
  };
}

import type { Prisma } from "@prisma/client";
import {
  CASH_REFUND_REVIEW_REASONS,
  buildCreditPackRefundClawbackIdempotencyKey,
} from "@ai-music/shared";
import {
  CREDIT_CLAWBACK_INVARIANT_VIOLATION,
  CreditClawbackInvariantError,
  finalizeCreditPackRefundClawback,
  type ClawbackFinalizeResult,
} from "./credit-grant-lots.js";

type Tx = Prisma.TransactionClient;

/**
 * Local effects after provider monetary reverse SUCCESS.
 * - purchase_remainder: debit unused paid credits that were refunded
 * - operation: mark spend allocations as cash-refunded; no credit restore
 * - legacy rows without cashRefundCreditUnits: reservation-era clawback helper
 */
export async function finalizeUserCashRefundLocalEffects(
  tx: Tx,
  input: {
    userId: string;
    purchaseId: string;
    refundRequestId: string;
  },
): Promise<ClawbackFinalizeResult> {
  const refund = await tx.refundRequest.findUnique({
    where: { id: input.refundRequestId },
    select: {
      id: true,
      userId: true,
      paymentId: true,
      scope: true,
      cashRefundCreditUnits: true,
      sourceSpendLedgerEntryId: true,
      status: true,
    },
  });

  if (!refund || refund.userId !== input.userId || refund.paymentId !== input.purchaseId) {
    return {
      ok: false,
      reason: CREDIT_CLAWBACK_INVARIANT_VIOLATION,
      detail: "refund_row_mismatch",
    };
  }

  // Pre-policy rows (approved without entitlement snapshot) keep legacy behavior.
  if (refund.cashRefundCreditUnits == null) {
    return finalizeCreditPackRefundClawback(tx, input);
  }

  const scope = refund.scope === "operation" ? "operation" : "purchase_remainder";
  const units = refund.cashRefundCreditUnits;

  if (scope === "operation") {
    return finalizeOperationCashEffects(tx, {
      userId: input.userId,
      refundRequestId: refund.id,
      sourceSpendLedgerEntryId: refund.sourceSpendLedgerEntryId,
      expectedUnits: units,
    });
  }

  return finalizePurchaseRemainderEffects(tx, {
    userId: input.userId,
    purchaseId: input.purchaseId,
    refundRequestId: refund.id,
    cashRefundCreditUnits: units,
  });
}

async function finalizeOperationCashEffects(
  tx: Tx,
  input: {
    userId: string;
    refundRequestId: string;
    sourceSpendLedgerEntryId: string | null;
    expectedUnits: number;
  },
): Promise<ClawbackFinalizeResult> {
  if (!input.sourceSpendLedgerEntryId || input.expectedUnits <= 0) {
    return {
      ok: false,
      reason: CREDIT_CLAWBACK_INVARIANT_VIOLATION,
      detail: "operation_refund_incomplete",
    };
  }

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.userId})::bigint)`;

  const allocations = await tx.creditGrantLotAllocation.findMany({
    where: { spendLedgerEntryId: input.sourceSpendLedgerEntryId },
    include: {
      lot: { select: { sourcePurchaseId: true } },
    },
  });

  if (allocations.some((row) => row.restoredAt != null)) {
    return {
      ok: false,
      reason: CREDIT_CLAWBACK_INVARIANT_VIOLATION,
      detail: CASH_REFUND_REVIEW_REASONS.operationAlreadyCreditCompensated,
    };
  }

  const paid = allocations.filter((row) => row.lot.sourcePurchaseId != null);
  const alreadyMarked = paid.filter((row) => row.cashRefundRequestId === input.refundRequestId);
  if (alreadyMarked.length === paid.length && paid.length > 0) {
    return { ok: true, clawbackAmountUnits: 0, alreadyApplied: true };
  }
  if (paid.some((row) => row.cashRefundRequestId != null)) {
    return {
      ok: false,
      reason: CREDIT_CLAWBACK_INVARIANT_VIOLATION,
      detail: CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded,
    };
  }

  const sum = paid.reduce((acc, row) => acc + row.amountUnits, 0);
  if (sum !== input.expectedUnits) {
    return {
      ok: false,
      reason: CREDIT_CLAWBACK_INVARIANT_VIOLATION,
      detail: "operation_units_mismatch",
    };
  }

  for (const row of paid) {
    const updated = await tx.creditGrantLotAllocation.updateMany({
      where: { id: row.id, cashRefundRequestId: null, restoredAt: null },
      data: { cashRefundRequestId: input.refundRequestId },
    });
    if (updated.count !== 1) {
      return {
        ok: false,
        reason: CREDIT_CLAWBACK_INVARIANT_VIOLATION,
        detail: CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded,
      };
    }
  }

  return { ok: true, clawbackAmountUnits: 0, alreadyApplied: false };
}

async function finalizePurchaseRemainderEffects(
  tx: Tx,
  input: {
    userId: string;
    purchaseId: string;
    refundRequestId: string;
    cashRefundCreditUnits: number;
  },
): Promise<ClawbackFinalizeResult> {
  const idempotencyKey = buildCreditPackRefundClawbackIdempotencyKey(input.refundRequestId);
  const existing = await tx.creditTransaction.findUnique({
    where: { idempotencyKey },
    select: { id: true, amountUnits: true },
  });
  if (existing) {
    return {
      ok: true,
      clawbackAmountUnits: Math.abs(existing.amountUnits),
      alreadyApplied: true,
    };
  }

  if (input.cashRefundCreditUnits <= 0) {
    return {
      ok: false,
      reason: CREDIT_CLAWBACK_INVARIANT_VIOLATION,
      detail: "remainder_units_invalid",
    };
  }

  const lot = await tx.creditGrantLot.findFirst({
    where: { sourcePurchaseId: input.purchaseId, userId: input.userId },
    orderBy: { createdAt: "asc" },
  });
  if (!lot) {
    return {
      ok: false,
      reason: CREDIT_CLAWBACK_INVARIANT_VIOLATION,
      detail: CASH_REFUND_REVIEW_REASONS.lotMissing,
    };
  }

  if (lot.remainingAmountUnits < input.cashRefundCreditUnits) {
    return {
      ok: false,
      reason: CREDIT_CLAWBACK_INVARIANT_VIOLATION,
      detail: CASH_REFUND_REVIEW_REASONS.creditsConsumedDuringProcessing,
    };
  }

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.userId})::bigint)`;

  const balance = await tx.creditTransaction.aggregate({
    where: { userId: input.userId },
    _sum: { amountUnits: true },
  });
  const ledgerBalanceUnits = balance._sum.amountUnits ?? 0;
  if (ledgerBalanceUnits < input.cashRefundCreditUnits) {
    return {
      ok: false,
      reason: CREDIT_CLAWBACK_INVARIANT_VIOLATION,
      detail: CASH_REFUND_REVIEW_REASONS.creditsConsumedDuringProcessing,
    };
  }

  const decremented = await tx.creditGrantLot.updateMany({
    where: {
      id: lot.id,
      userId: input.userId,
      remainingAmountUnits: { gte: input.cashRefundCreditUnits },
    },
    data: {
      remainingAmountUnits: { decrement: input.cashRefundCreditUnits },
    },
  });
  if (decremented.count !== 1) {
    return {
      ok: false,
      reason: CREDIT_CLAWBACK_INVARIANT_VIOLATION,
      detail: CASH_REFUND_REVIEW_REASONS.creditsConsumedDuringProcessing,
    };
  }

  const after = await tx.creditGrantLot.findUnique({
    where: { id: lot.id },
    select: { remainingAmountUnits: true },
  });
  if (after && after.remainingAmountUnits === 0) {
    await tx.creditGrantLot.update({
      where: { id: lot.id },
      data: {
        reservedAmountUnits: 0,
        reservedRefundRequestId: null,
        status: "clawed",
      },
    });
  }

  await tx.creditTransaction.create({
    data: {
      userId: input.userId,
      type: "clawback",
      amountUnits: -input.cashRefundCreditUnits,
      reason: `credit_pack_cash_refund:${input.purchaseId}`,
      idempotencyKey,
      relatedEntityType: "credit_pack_purchase",
      relatedEntityId: input.purchaseId,
    },
  });

  return {
    ok: true,
    clawbackAmountUnits: input.cashRefundCreditUnits,
    alreadyApplied: false,
  };
}

export function assertCashRefundLocalOk(result: ClawbackFinalizeResult): void {
  if (!result.ok) {
    throw new CreditClawbackInvariantError(result.detail);
  }
}

import type { Prisma } from "@prisma/client";
import {
  CASH_REFUND_REVIEW_REASONS,
  hasRefundProviderAttemptMarker,
} from "@ai-music/shared";

type Tx = Prisma.TransactionClient;

export class SpendAlreadyCashRefundedError extends Error {
  readonly code: typeof CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded;
  readonly spendLedgerEntryId: string;

  constructor(spendLedgerEntryId: string) {
    super(CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded);
    this.name = "SpendAlreadyCashRefundedError";
    this.code = CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded;
    this.spendLedgerEntryId = spendLedgerEntryId;
  }
}

export type SpendCreditCompensationDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: typeof CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded;
    };

/**
 * Reciprocal of OPERATION_ALREADY_CREDIT_COMPENSATED:
 * monetarily in-flight / succeeded operation cash refund blocks system credit restore
 * for the same exact spend ledger entry.
 */
export async function evaluateSpendCreditCompensation(
  tx: Tx,
  input: { spendLedgerEntryId: string },
): Promise<SpendCreditCompensationDecision> {
  const stamped = await tx.creditGrantLotAllocation.findFirst({
    where: {
      spendLedgerEntryId: input.spendLedgerEntryId,
      cashRefundRequestId: { not: null },
    },
    select: { id: true },
  });
  if (stamped) {
    return {
      allowed: false,
      reason: CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded,
    };
  }

  const cashRows = await tx.refundRequest.findMany({
    where: {
      sourceSpendLedgerEntryId: input.spendLedgerEntryId,
      scope: "operation",
      status: { in: ["approved", "processing", "refunded", "needs_review"] },
    },
    select: {
      status: true,
      providerReference: true,
      providerError: true,
    },
  });

  for (const row of cashRows) {
    if (
      row.status === "approved" ||
      row.status === "processing" ||
      row.status === "refunded"
    ) {
      return {
        allowed: false,
        reason: CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded,
      };
    }

    if (
      row.status === "needs_review" &&
      hasRefundProviderAttemptMarker(row.providerReference, row.providerError)
    ) {
      return {
        allowed: false,
        reason: CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded,
      };
    }
  }

  return { allowed: true };
}

export async function assertSpendEligibleForCreditCompensation(
  tx: Tx,
  input: { spendLedgerEntryId: string },
): Promise<void> {
  const decision = await evaluateSpendCreditCompensation(tx, input);
  if (!decision.allowed) {
    throw new SpendAlreadyCashRefundedError(input.spendLedgerEntryId);
  }
}

export function logSpendCreditCompensationBlocked(input: {
  userId: string;
  spendLedgerEntryId: string;
  refundIdempotencyKey?: string;
}): void {
  console.info(
    JSON.stringify({
      scope: "credits",
      event: "spend_credit_compensation_blocked",
      reason: CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded,
      userId: input.userId,
      spendLedgerEntryId: input.spendLedgerEntryId,
      refundIdempotencyKey: input.refundIdempotencyKey ?? null,
    }),
  );
}

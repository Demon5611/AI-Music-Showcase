import {
  Prisma,
  prisma,
  lockUserCreditsInTransaction,
  resolveOperationCashRefund,
  resolvePurchaseRemainderCashRefund,
  type CashRefundEntitlementResult,
  type RefundRequest,
} from "@ai-music/db";
import {
  FLITT_PAYMENT_PROVIDER,
  TBC_PAYMENT_PROVIDER,
  evaluateCreditPackRefundApproval,
  type ApproveRefundRequestInput,
  type CreateRefundRequestInput,
} from "@ai-music/shared";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RefundEnqueueFailedError,
} from "../../common/errors.js";
import {
  evaluateRefundRequeue,
  refundJobIdForProvider,
  type RefundRequeueOutcome,
} from "./refund-enqueue.service.js";
import type { RefundJobEnqueueOutcome } from "../queue/enqueue-refund-job.js";
import { requirePurchaseOwner } from "../../common/authorization.js";
import { logSecurityEvent } from "../../common/security-log.js";
import {
  assertRefundAmountAllowed,
  calculateRefundableAmount,
  getAdminRefundableAmountSnapshot,
  roundMoney,
  type RefundableAmountResult,
} from "./calculate-refundable-amount.js";
import { enqueueTbcRefundJob } from "../queue/tbc-refund-queue.js";
import { enqueueFlittRefundJob } from "../queue/flitt-refund-queue.js";

export type RefundRequestView = {
  id: string;
  userId: string;
  paymentId: string;
  amount: number | null;
  currency: string;
  reason: string;
  status: string;
  scope: string;
  cashRefundCreditUnits: number | null;
  sourceSpendLedgerEntryId: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectReason: string | null;
  provider: string;
  providerError: string | null;
  reviewReason: string | null;
  outcome: "requested" | "approved" | "needs_review" | "refunded" | "already_refunded" | "rejected" | "failed" | "processing";
  createdAt: string;
  updatedAt: string;
};

export type EnqueueApprovedRefundDeps = {
  enqueueFlitt?: typeof enqueueFlittRefundJob;
  enqueueTbc?: typeof enqueueTbcRefundJob;
};

/**
 * Monetary refund routing uses the persisted purchase/refund provider.
 * Never read PAYMENT_PROVIDER / current checkout setting.
 */
function refundOutcome(status: string): RefundRequestView["outcome"] {
  if (status === "refunded") {
    return "already_refunded";
  }
  if (
    status === "needs_review" ||
    status === "approved" ||
    status === "requested" ||
    status === "processing" ||
    status === "rejected" ||
    status === "failed"
  ) {
    return status;
  }
  return "requested";
}

export function resolveMonetaryRefundEnqueueTarget(
  storedProvider: string,
): typeof FLITT_PAYMENT_PROVIDER | typeof TBC_PAYMENT_PROVIDER {
  if (storedProvider === FLITT_PAYMENT_PROVIDER) {
    return FLITT_PAYMENT_PROVIDER;
  }
  if (storedProvider === TBC_PAYMENT_PROVIDER) {
    return TBC_PAYMENT_PROVIDER;
  }
  throw new BadRequestError(
    "Only prepaid pack purchases support monetary refunds",
    "REFUND_PROVIDER",
  );
}

function mapRefundView(row: RefundRequest): RefundRequestView {
  return {
    id: row.id,
    userId: row.userId,
    paymentId: row.paymentId,
    amount: row.amount === null ? null : Number(row.amount),
    currency: row.currency,
    reason: row.reason,
    status: row.status,
    scope: row.scope,
    cashRefundCreditUnits: row.cashRefundCreditUnits,
    sourceSpendLedgerEntryId: row.sourceSpendLedgerEntryId,
    requestedAt: row.requestedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedBy: row.reviewedBy,
    rejectReason: row.rejectReason,
    provider: row.provider,
    providerError: row.providerError,
    reviewReason: row.rejectReason,
    outcome: refundOutcome(row.status),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function entitlementOrThrow(result: CashRefundEntitlementResult): Extract<
  CashRefundEntitlementResult,
  { ok: true }
> {
  if (!result.ok) {
    throw new BadRequestError(result.reason, result.reason);
  }
  return result;
}

export async function createRefundRequest(
  userId: string,
  input: CreateRefundRequestInput,
): Promise<RefundRequestView> {
  const scope =
    input.scope ?? (input.sourceSpendLedgerEntryId ? "operation" : "purchase_remainder");

  const entitlement = entitlementOrThrow(
    await prisma.$transaction(async (tx) => {
      if (scope === "operation") {
        return resolveOperationCashRefund(tx, {
          userId,
          sourceSpendLedgerEntryId: input.sourceSpendLedgerEntryId!,
        });
      }
      return resolvePurchaseRemainderCashRefund(tx, {
        userId,
        paymentId: input.paymentId!,
      });
    }),
  );

  await requirePurchaseOwner(userId, entitlement.paymentId);

  const purchase = await prisma.creditPackPurchase.findUniqueOrThrow({
    where: { id: entitlement.paymentId },
  });
  const storedProvider = resolveMonetaryRefundEnqueueTarget(purchase.provider);

  if (!purchase.providerPaymentId?.trim()) {
    throw new BadRequestError(
      "Purchase has no provider payment id yet",
      "PURCHASE_NOT_PAID",
    );
  }

  const refundable = await calculateRefundableAmount(purchase.id);
  if (refundable.remainingRefundableAmount <= 0) {
    throw new BadRequestError("Nothing left to refund", "NOTHING_TO_REFUND");
  }

  const open = await prisma.refundRequest.findFirst({
    where: {
      paymentId: purchase.id,
      status: { in: ["requested", "approved", "processing", "needs_review"] },
    },
    select: { id: true },
  });

  if (open) {
    throw new ConflictError(
      "A refund request is already in progress for this payment",
      "REFUND_ALREADY_OPEN",
    );
  }

  if (scope === "operation" && entitlement.sourceSpendLedgerEntryId) {
    const openOp = await prisma.refundRequest.findFirst({
      where: {
        sourceSpendLedgerEntryId: entitlement.sourceSpendLedgerEntryId,
        status: { in: ["requested", "approved", "processing", "needs_review"] },
      },
      select: { id: true },
    });
    if (openOp) {
      throw new ConflictError(
        "A cash refund is already in progress for this operation",
        "OPERATION_REFUND_ALREADY_OPEN",
      );
    }
  }

  const created = await prisma.refundRequest.create({
    data: {
      userId,
      paymentId: purchase.id,
      currency: purchase.currency,
      reason: input.reason.trim(),
      status: "requested",
      provider: storedProvider,
      scope,
      sourceSpendLedgerEntryId: entitlement.sourceSpendLedgerEntryId,
    },
  });

  logSecurityEvent("refund_requested", {
    refundRequestId: created.id,
    paymentId: purchase.id,
    actorUserId: userId,
    provider: purchase.provider,
    status: "requested",
    scope,
  });

  return mapRefundView(created);
}

export async function listRefundRequestsForAdmin(options?: {
  status?: string;
  limit?: number;
}): Promise<RefundRequestView[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const rows = await prisma.refundRequest.findMany({
    where: options?.status ? { status: options.status } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(mapRefundView);
}

export async function getRefundRequestForAdmin(
  refundId: string,
): Promise<RefundRequestView & { refundable: RefundableAmountResult }> {
  const row = await prisma.refundRequest.findUnique({ where: { id: refundId } });
  if (!row) {
    throw new NotFoundError("Refund request not found");
  }

  // Read-only snapshot — must not use eligibility gate (refunded → remaining=0).
  const refundable = await getAdminRefundableAmountSnapshot(row.paymentId);
  return { ...mapRefundView(row), refundable };
}

export async function rejectRefundRequest(
  adminUserId: string,
  refundId: string,
  reason?: string,
): Promise<RefundRequestView> {
  const existing = await prisma.refundRequest.findUnique({ where: { id: refundId } });
  if (!existing) {
    throw new NotFoundError("Refund request not found");
  }

  if (existing.status !== "requested") {
    throw new ConflictError("Only requested refunds can be rejected", "REFUND_NOT_REQUESTED");
  }

  const updated = await prisma.refundRequest.updateMany({
    where: { id: refundId, status: "requested" },
    data: {
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: adminUserId,
      rejectReason: reason?.trim() || null,
    },
  });

  if (updated.count !== 1) {
    throw new ConflictError("Refund request was already reviewed", "REFUND_RACE");
  }

  const row = await prisma.refundRequest.findUniqueOrThrow({ where: { id: refundId } });

  logSecurityEvent("refund_rejected", {
    refundRequestId: refundId,
    paymentId: row.paymentId,
    actorUserId: adminUserId,
    provider: row.provider,
    status: "rejected",
  });

  return mapRefundView(row);
}

export async function approveRefundRequest(
  adminUserId: string,
  refundId: string,
  input: ApproveRefundRequestInput,
  deps: EnqueueApprovedRefundDeps = {},
): Promise<RefundRequestView> {
  const existing = await prisma.refundRequest.findUnique({ where: { id: refundId } });
  if (!existing) {
    throw new NotFoundError("Refund request not found");
  }

  if (existing.status !== "requested") {
    throw new ConflictError("Only requested refunds can be approved", "REFUND_NOT_REQUESTED");
  }

  const refundable = await calculateRefundableAmount(existing.paymentId);

  resolveMonetaryRefundEnqueueTarget(refundable.provider);

  if (!refundable.providerPaymentId?.trim()) {
    throw new BadRequestError("Missing provider payment id", "MISSING_PROVIDER_PAYMENT_ID");
  }

  if (refundable.currency !== existing.currency) {
    throw new BadRequestError("Currency mismatch", "REFUND_CURRENCY_MISMATCH");
  }

  const mode = input.mode ?? (input.amount !== undefined ? "partial" : "full");

  // Partial money amounts still require admin review (amount policy).
  // Full uses server-computed credit-provenance entitlement only.
  const decision = await prisma.$transaction(async (tx) => {
    await lockUserCreditsInTransaction(existing.userId, tx);

    const eligibility = evaluateCreditPackRefundApproval({ mode });
    const now = new Date();

    if (eligibility.action === "needs_review") {
      const moved = await tx.refundRequest.updateMany({
        where: { id: refundId, status: "requested" },
        data: {
          status: "needs_review",
          amount:
            input.amount !== undefined ? new Prisma.Decimal(roundMoney(input.amount)) : null,
          reviewedAt: now,
          reviewedBy: adminUserId,
          rejectReason: eligibility.reason ?? null,
        },
      });
      if (moved.count !== 1) {
        throw new ConflictError("Refund request was already reviewed", "REFUND_RACE");
      }
      return { enqueue: false as const, amount: input.amount ?? null };
    }

    const entitlement =
      existing.scope === "operation"
        ? await resolveOperationCashRefund(tx, {
            userId: existing.userId,
            sourceSpendLedgerEntryId: existing.sourceSpendLedgerEntryId!,
          })
        : await resolvePurchaseRemainderCashRefund(tx, {
            userId: existing.userId,
            paymentId: existing.paymentId,
          });

    if (!entitlement.ok) {
      const moved = await tx.refundRequest.updateMany({
        where: { id: refundId, status: "requested" },
        data: {
          status: "needs_review",
          reviewedAt: now,
          reviewedBy: adminUserId,
          rejectReason: entitlement.reason,
        },
      });
      if (moved.count !== 1) {
        throw new ConflictError("Refund request was already reviewed", "REFUND_RACE");
      }
      return { enqueue: false as const, amount: null };
    }

    if (entitlement.paymentId !== existing.paymentId) {
      throw new BadRequestError("Refund purchase mismatch", "REFUND_PURCHASE_MISMATCH");
    }

    const amountMajor = Number(entitlement.amountMajor);
    assertRefundAmountAllowed(amountMajor, refundable.remainingRefundableAmount);

    const moved = await tx.refundRequest.updateMany({
      where: { id: refundId, status: "requested" },
      data: {
        status: "approved",
        amount: new Prisma.Decimal(entitlement.amountMajor),
        cashRefundCreditUnits: entitlement.cashRefundCreditUnits,
        scope: entitlement.scope,
        sourceSpendLedgerEntryId: entitlement.sourceSpendLedgerEntryId,
        reviewedAt: now,
        reviewedBy: adminUserId,
        rejectReason: null,
      },
    });
    if (moved.count !== 1) {
      throw new ConflictError("Refund request was already reviewed", "REFUND_RACE");
    }

    return { enqueue: true as const, amount: amountMajor };
  });

  const row = await prisma.refundRequest.findUniqueOrThrow({ where: { id: refundId } });

  if (!decision.enqueue) {
    logSecurityEvent("refund_needs_review", {
      refundRequestId: refundId,
      paymentId: row.paymentId,
      actorUserId: adminUserId,
      amount: decision.amount,
      provider: row.provider,
      status: "needs_review",
      reason: row.rejectReason,
    });
    return mapRefundView(row);
  }

  logSecurityEvent("refund_approved", {
    refundRequestId: refundId,
    paymentId: row.paymentId,
    actorUserId: adminUserId,
    amount: decision.amount,
    provider: row.provider,
    status: "approved",
    scope: row.scope,
    cashRefundCreditUnits: row.cashRefundCreditUnits,
  });

  await enqueueApprovedRefundOrThrow(row, deps);

  return mapRefundView(row);
}

export async function enqueueApprovedRefund(
  row: Pick<RefundRequest, "id" | "provider">,
  deps: EnqueueApprovedRefundDeps = {},
): Promise<RefundJobEnqueueOutcome> {
  const target = resolveMonetaryRefundEnqueueTarget(row.provider);
  const enqueueFlitt = deps.enqueueFlitt ?? enqueueFlittRefundJob;
  const enqueueTbc = deps.enqueueTbc ?? enqueueTbcRefundJob;
  const jobId = refundJobIdForProvider(target, row.id);

  logSecurityEvent("refund_enqueue_attempt", {
    refundRequestId: row.id,
    provider: target,
    jobId,
  });

  try {
    const outcome =
      target === FLITT_PAYMENT_PROVIDER
        ? await enqueueFlitt({ refundRequestId: row.id })
        : await enqueueTbc({ refundRequestId: row.id });

    logSecurityEvent("refund_enqueue_success", {
      refundRequestId: row.id,
      provider: target,
      jobId,
      outcome,
    });
    return outcome;
  } catch (error) {
    logSecurityEvent("refund_enqueue_failed", {
      refundRequestId: row.id,
      provider: target,
      jobId,
      error: error instanceof Error ? error.message.slice(0, 500) : "enqueue_failed",
    });
    throw error;
  }
}

export async function enqueueApprovedRefundOrThrow(
  row: Pick<RefundRequest, "id" | "provider">,
  deps: EnqueueApprovedRefundDeps = {},
): Promise<RefundJobEnqueueOutcome> {
  try {
    return await enqueueApprovedRefund(row, deps);
  } catch {
    throw new RefundEnqueueFailedError();
  }
}

export type RefundRequeueResult = {
  outcome: RefundRequeueOutcome;
  reason?: string;
  jobId?: string;
  refund: RefundRequestView;
};

export async function requeueApprovedRefund(
  adminUserId: string,
  refundId: string,
  deps: EnqueueApprovedRefundDeps = {},
): Promise<RefundRequeueResult> {
  logSecurityEvent("refund_requeue_attempt", {
    refundRequestId: refundId,
    actorUserId: adminUserId,
  });

  const row = await prisma.refundRequest.findUnique({ where: { id: refundId } });
  if (!row) {
    throw new NotFoundError("Refund request not found");
  }

  const eligibility = evaluateRefundRequeue({
    status: row.status,
    refundId: row.id,
    providerReference: row.providerReference,
    providerError: row.providerError,
  });

  if (!eligibility.ok) {
    return {
      outcome: "not_requeueable",
      reason: eligibility.reason,
      refund: mapRefundView(row),
    };
  }

  const outcome = await enqueueApprovedRefund(row, deps);
  const jobId = refundJobIdForProvider(row.provider, row.id);

  logSecurityEvent("refund_requeue_success", {
    refundRequestId: refundId,
    actorUserId: adminUserId,
    provider: row.provider,
    jobId,
    outcome,
  });

  return {
    outcome,
    jobId,
    refund: mapRefundView(row),
  };
}

/** Guard: userId from body must never be used as identity. */
export function assertNoClientUserIdIdentity(body: unknown): void {
  if (!body || typeof body !== "object") {
    return;
  }

  if ("userId" in body) {
    throw new ForbiddenError("userId in body is not an identity source");
  }
}

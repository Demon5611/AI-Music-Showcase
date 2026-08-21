import {
  CreditClawbackInvariantError,
  finalizeUserCashRefundLocalEffects,
  prisma,
  releasePurchaseLotReservation,
} from "@ai-music/db";
import {
  CREDIT_PACK_REFUND_REVIEW_REASONS,
  hasRefundProviderAttemptMarker,
  TBC_PAYMENT_PROVIDER,
  type TbcRefundJobPayload,
} from "@ai-music/shared";
import { TbcCheckoutError } from "./tbc-errors.js";
import {
  createRefundPaymentProviderFromEnv,
  type RefundPaymentProvider,
} from "./refund-payment-provider.js";
import { TBC_PROVIDER_STATUSES } from "./tbc-status.js";

export type TbcRefundProcessResult =
  | { outcome: "already_terminal"; status: string }
  | { outcome: "refunded"; providerStatus: string }
  | { outcome: "needs_review"; reason: string }
  | { outcome: "failed"; reason: string }
  | { outcome: "retry"; reason: string };

type RefundDb = typeof prisma;

function isClawbackInvariantError(error: unknown): boolean {
  return (
    error instanceof CreditClawbackInvariantError ||
    (error instanceof Error &&
      (error.name === "CreditClawbackInvariantError" ||
        error.message.startsWith(CREDIT_PACK_REFUND_REVIEW_REASONS.clawbackInvariant)))
  );
}

function clawbackInvariantReviewReason(error: unknown): string {
  const detail =
    error instanceof CreditClawbackInvariantError
      ? error.detail
      : error instanceof Error
        ? error.message
        : "unknown";
  return `${CREDIT_PACK_REFUND_REVIEW_REASONS.clawbackInvariant}:${detail}`;
}

function sanitizeProviderError(error: unknown): string {
  if (error instanceof TbcCheckoutError) {
    return `${error.code}:${error.kind}:http=${error.httpStatus ?? "n/a"}`.slice(0, 500);
  }
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return "unknown_provider_error";
}

function logRefundEvent(event: string, fields: Record<string, unknown>): void {
  console.info(
    JSON.stringify({
      scope: "security",
      event,
      ts: new Date().toISOString(),
      ...fields,
    }),
  );
}

function isRefundSuccessStatus(status: string): boolean {
  return (
    status === TBC_PROVIDER_STATUSES.Returned ||
    status === TBC_PROVIDER_STATUSES.PartialReturned
  );
}

function isRefundInFlightStatus(status: string): boolean {
  return status === TBC_PROVIDER_STATUSES.CancelPaymentProcessing;
}

/** Durable cancel-attempted markers used by cancelAlreadyAttempted. */
function isCancelAlreadyAttempted(
  providerReference: string | null | undefined,
  providerError: string | null | undefined,
): boolean {
  return hasRefundProviderAttemptMarker(providerReference, providerError);
}

async function markNeedsReview(
  db: RefundDb,
  refundRequestId: string,
  paymentId: string,
  reason: string,
): Promise<TbcRefundProcessResult> {
  await db.refundRequest.updateMany({
    where: {
      id: refundRequestId,
      status: { in: ["approved", "processing"] },
    },
    data: {
      status: "needs_review",
      providerError: reason.slice(0, 500),
    },
  });

  logRefundEvent("refund_needs_review", {
    refundRequestId,
    paymentId,
    provider: TBC_PAYMENT_PROVIDER,
    status: "needs_review",
    reason,
  });

  return { outcome: "needs_review", reason };
}

async function markFailed(
  db: RefundDb,
  refundRequestId: string,
  paymentId: string,
  reason: string,
): Promise<TbcRefundProcessResult> {
  await db.$transaction(async (tx) => {
    await tx.refundRequest.updateMany({
      where: {
        id: refundRequestId,
        status: { in: ["approved", "processing"] },
      },
      data: {
        status: "failed",
        providerError: reason.slice(0, 500),
      },
    });
    await releasePurchaseLotReservation(tx, refundRequestId);
  });

  logRefundEvent("refund_failed", {
    refundRequestId,
    paymentId,
    provider: TBC_PAYMENT_PROVIDER,
    status: "failed",
    reason,
  });

  return { outcome: "failed", reason };
}

async function markRefunded(
  db: RefundDb,
  refundRequestId: string,
  paymentId: string,
  amount: number,
  providerStatus: string,
): Promise<TbcRefundProcessResult> {
  void amount;
  try {
    await db.$transaction(async (tx) => {
      const purchase = await tx.creditPackPurchase.findUnique({
        where: { id: paymentId },
        select: { priceAmount: true, userId: true, creditsAmount: true },
      });
      if (!purchase) {
        throw new CreditClawbackInvariantError("purchase_missing");
      }

      if (purchase.userId) {
        const clawback = await finalizeUserCashRefundLocalEffects(tx, {
          userId: purchase.userId,
          purchaseId: paymentId,
          refundRequestId,
        });
        if (!clawback.ok) {
          throw new CreditClawbackInvariantError(clawback.detail);
        }
      }

      await tx.refundRequest.updateMany({
        where: {
          id: refundRequestId,
          status: { in: ["approved", "processing"] },
        },
        data: {
          status: "refunded",
          providerReference: refundRequestId,
          providerError: null,
        },
      });

      const original = Number(purchase.priceAmount);
      const after = await tx.refundRequest.aggregate({
        where: { paymentId, status: "refunded" },
        _sum: { amount: true },
      });
      const total = Number(after._sum.amount ?? 0);
      const nextStatus =
        total + 1e-9 >= original ? "refunded" : "partial_refunded";

      await tx.creditPackPurchase.update({
        where: { id: paymentId },
        data: {
          status: nextStatus,
          providerStatus,
        },
      });
    });
  } catch (error) {
    if (isClawbackInvariantError(error)) {
      return markNeedsReview(db, refundRequestId, paymentId, clawbackInvariantReviewReason(error));
    }
    throw error;
  }

  logRefundEvent("refund_completed", {
    refundRequestId,
    paymentId,
    amount,
    provider: TBC_PAYMENT_PROVIDER,
    status: "refunded",
    providerStatus,
  });

  return { outcome: "refunded", providerStatus };
}

/**
 * Persist immediately after an ambiguous cancel attempt so BullMQ retries
 * only reconcile via GET and never call cancelPayment/refund again.
 */
async function persistAmbiguousCancelAttempted(
  db: RefundDb,
  refundRequestId: string,
  sanitizedError: string,
): Promise<void> {
  await db.refundRequest.updateMany({
    where: { id: refundRequestId, status: "processing" },
    data: {
      providerError: `ambiguous_cancel_attempted:${sanitizedError}`.slice(0, 500),
    },
  });
}

export type ProcessTbcRefundDeps = {
  createProvider?: () => RefundPaymentProvider;
  /** Test seam — production uses default prisma. */
  prismaClient?: RefundDb;
};

/**
 * Worker flow:
 * approved → CAS processing → TBC cancel → GET payment reconcile → refunded | failed | needs_review
 *
 * On ambiguous network/timeout: NEVER blind-retry cancel — reconcile via GET first.
 */
export async function processTbcRefundJob(
  payload: TbcRefundJobPayload,
  deps: ProcessTbcRefundDeps = {},
): Promise<TbcRefundProcessResult> {
  const db = deps.prismaClient ?? prisma;
  const row = await db.refundRequest.findUnique({
    where: { id: payload.refundRequestId },
  });

  if (!row) {
    return { outcome: "failed", reason: "refund_request_not_found" };
  }

  if (row.status === "refunded" || row.status === "rejected" || row.status === "failed") {
    return { outcome: "already_terminal", status: row.status };
  }

  if (row.status === "needs_review") {
    return { outcome: "already_terminal", status: row.status };
  }

  if (row.status !== "approved" && row.status !== "processing") {
    return { outcome: "failed", reason: `unexpected_status:${row.status}` };
  }

  if (row.amount === null) {
    return markFailed(db, row.id, row.paymentId, "missing_approved_amount");
  }

  const amount = Number(row.amount);
  const purchase = await db.creditPackPurchase.findUnique({
    where: { id: row.paymentId },
  });

  if (!purchase?.providerPaymentId?.trim()) {
    return markFailed(db, row.id, row.paymentId, "missing_provider_payment_id");
  }

  const payId = purchase.providerPaymentId.trim();
  const original = Number(purchase.priceAmount);
  const partial = amount + 1e-9 < original;

  // CAS approved → processing (idempotent if already processing)
  if (row.status === "approved") {
    const cas = await db.refundRequest.updateMany({
      where: { id: row.id, status: "approved" },
      data: { status: "processing" },
    });
    if (cas.count !== 1) {
      const again = await db.refundRequest.findUnique({ where: { id: row.id } });
      if (again?.status === "refunded") {
        return { outcome: "already_terminal", status: "refunded" };
      }
      if (again?.status !== "processing") {
        return { outcome: "retry", reason: "cas_processing_race" };
      }
    }
  }

  logRefundEvent("refund_processing", {
    refundRequestId: row.id,
    paymentId: row.paymentId,
    amount,
    provider: TBC_PAYMENT_PROVIDER,
    status: "processing",
  });

  const provider = deps.createProvider?.() ?? createRefundPaymentProviderFromEnv();

  // If we already called cancel (restart), reconcile before another cancel.
  let details;
  try {
    details = await provider.getPaymentDetails(payId);
  } catch (error) {
    const sanitized = sanitizeProviderError(error);
    if (error instanceof TbcCheckoutError && error.kind === "network") {
      return { outcome: "retry", reason: sanitized };
    }
    return markNeedsReview(db, row.id, row.paymentId, `reconcile_get_failed:${sanitized}`);
  }

  if (isRefundSuccessStatus(details.status)) {
    return markRefunded(db, row.id, row.paymentId, amount, details.status);
  }

  if (isRefundInFlightStatus(details.status)) {
    return { outcome: "retry", reason: "cancel_payment_processing" };
  }

  // Cancel already attempted (prior ambiguous/awaiting retry) — only reconcile, never cancel again.
  if (isCancelAlreadyAttempted(row.providerReference, row.providerError)) {
    if (isRefundSuccessStatus(details.status)) {
      return markRefunded(db, row.id, row.paymentId, amount, details.status);
    }
    if (isRefundInFlightStatus(details.status)) {
      return { outcome: "retry", reason: "cancel_payment_processing" };
    }
    if (details.status === TBC_PROVIDER_STATUSES.Succeeded) {
      return markNeedsReview(
        db,
        row.id,
        row.paymentId,
        `cancel_attempted_still_succeeded:${details.status}`,
      );
    }
    return markNeedsReview(
      db,
      row.id,
      row.paymentId,
      `cancel_attempted_unresolved_status:${details.status}`,
    );
  }

  // Not yet refunded — attempt cancel once from processing.
  try {
    await provider.refund({
      providerPaymentId: payId,
      amount,
      currency: row.currency,
      refundRequestId: row.id,
      partial,
    });
    await db.refundRequest.updateMany({
      where: { id: row.id, status: "processing" },
      data: { providerReference: row.id },
    });
  } catch (error) {
    const sanitized = sanitizeProviderError(error);

    // Ambiguous: do not blind-retry cancel — persist attempt, then reconcile.
    if (
      error instanceof TbcCheckoutError &&
      (error.kind === "network" || error.kind === "provider_5xx" || error.kind === "protocol")
    ) {
      await persistAmbiguousCancelAttempted(db, row.id, sanitized);

      try {
        const after = await provider.getPaymentDetails(payId);
        if (isRefundSuccessStatus(after.status)) {
          return markRefunded(db, row.id, row.paymentId, amount, after.status);
        }
        if (isRefundInFlightStatus(after.status)) {
          return { outcome: "retry", reason: "cancel_payment_processing_after_error" };
        }
        return markNeedsReview(
          db,
          row.id,
          row.paymentId,
          `ambiguous_after_cancel:${sanitized}:providerStatus=${after.status}`,
        );
      } catch (reconcileError) {
        return markNeedsReview(
          db,
          row.id,
          row.paymentId,
          `ambiguous_cancel_no_reconcile:${sanitized}:${sanitizeProviderError(reconcileError)}`,
        );
      }
    }

    if (error instanceof TbcCheckoutError && error.kind === "validation") {
      return markFailed(db, row.id, row.paymentId, sanitized);
    }

    if (error instanceof TbcCheckoutError && error.kind === "provider_4xx") {
      return markFailed(db, row.id, row.paymentId, sanitized);
    }

    return markNeedsReview(db, row.id, row.paymentId, sanitized);
  }

  // Post-cancel reconcile
  try {
    const after = await provider.getPaymentDetails(payId);
    if (isRefundSuccessStatus(after.status)) {
      return markRefunded(db, row.id, row.paymentId, amount, after.status);
    }
    if (isRefundInFlightStatus(after.status)) {
      return { outcome: "retry", reason: "cancel_payment_processing_after_cancel" };
    }
    // Cancel returned 200 but status not yet Returned — wait/retry GET, not cancel again.
    await db.refundRequest.updateMany({
      where: { id: row.id, status: "processing" },
      data: {
        providerReference: row.id,
        providerError: `awaiting_provider_status:${after.status}`.slice(0, 500),
      },
    });
    return { outcome: "retry", reason: `awaiting_status:${after.status}` };
  } catch (error) {
    return markNeedsReview(
      db,
      row.id,
      row.paymentId,
      `post_cancel_reconcile_failed:${sanitizeProviderError(error)}`,
    );
  }
}

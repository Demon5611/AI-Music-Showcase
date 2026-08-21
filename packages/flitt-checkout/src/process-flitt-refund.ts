import {
  CreditClawbackInvariantError,
  finalizeUserCashRefundLocalEffects,
  prisma,
  releasePurchaseLotReservation,
} from "@ai-music/db";
import {
  CREDIT_PACK_REFUND_REVIEW_REASONS,
  FLITT_PAYMENT_PROVIDER,
  hasRefundProviderAttemptMarker,
  REFUND_MONEY_COUNTED_STATUSES,
} from "@ai-music/shared";
import { majorStringToFlittMinorUnits } from "./flitt-amount.js";
import { FlittCheckoutError } from "./flitt-errors.js";
import { FlittPaymentProvider } from "./flitt-payment-provider.js";
import { FLITT_ORDER_STATUSES } from "./flitt-status.js";
import type { PaymentProvider } from "./payment-provider.js";

export type FlittRefundProcessResult =
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
  if (error instanceof FlittCheckoutError) {
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

/**
 * Flitt `reversal_amount` is cumulative on the order.
 * Compare it to the sum of counted RefundRequest amounts, not this job's
 * requested amount alone — otherwise a second partial of ≤ already-reversed
 * money would skip `/api/reverse` and still mark the new request refunded.
 */
function isRefundApplied(
  providerStatus: string,
  reversalAmountMinor: number,
  expectedReversalMinor: number,
  chargedMinor: number,
): boolean {
  if (providerStatus === FLITT_ORDER_STATUSES.reversed) {
    return true;
  }
  return (
    expectedReversalMinor > 0 &&
    chargedMinor > 0 &&
    reversalAmountMinor + 1e-9 >= expectedReversalMinor
  );
}

async function expectedReversalMinor(db: RefundDb, paymentId: string): Promise<number> {
  const aggregated = await db.refundRequest.aggregate({
    where: {
      paymentId,
      status: { in: [...REFUND_MONEY_COUNTED_STATUSES] },
    },
    _sum: { amount: true },
  });
  const raw = aggregated._sum.amount;
  if (raw == null) {
    return 0;
  }
  const asString = typeof raw === "string" ? raw : String(raw);
  if (!(Number(asString) > 0)) {
    return 0;
  }
  return majorStringToFlittMinorUnits(asString);
}

function isReverseAlreadyAttempted(
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
): Promise<FlittRefundProcessResult> {
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
    provider: FLITT_PAYMENT_PROVIDER,
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
): Promise<FlittRefundProcessResult> {
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
    provider: FLITT_PAYMENT_PROVIDER,
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
): Promise<FlittRefundProcessResult> {
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
      const nextStatus = total + 1e-9 >= original ? "refunded" : "partial_refunded";

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
    provider: FLITT_PAYMENT_PROVIDER,
    status: "refunded",
    providerStatus,
  });

  return { outcome: "refunded", providerStatus };
}

async function persistAmbiguousReverseAttempted(
  db: RefundDb,
  refundRequestId: string,
  sanitizedError: string,
): Promise<void> {
  await db.refundRequest.updateMany({
    where: { id: refundRequestId, status: "processing" },
    data: {
      providerError: `ambiguous_reverse_attempted:${sanitizedError}`.slice(0, 500),
    },
  });
}

export type ProcessFlittRefundDeps = {
  createProvider?: () => PaymentProvider;
  prismaClient?: RefundDb;
};

/**
 * Flitt reverse is not TBC cancel:
 * - always send amount (full = snapshot minor units)
 * - reverse_id = RefundRequest.id (idempotent retries)
 * - success = order_status=reversed OR reversal_amount >= counted RefundRequest sum
 * - after ambiguous HTTP: GET status first; same reverse_id may be retried if GET shows no reversal
 */
export async function processFlittRefundJob(
  payload: { refundRequestId: string },
  deps: ProcessFlittRefundDeps = {},
): Promise<FlittRefundProcessResult> {
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

  if (!purchase?.merchantPaymentId?.trim()) {
    return markFailed(db, row.id, row.paymentId, "missing_merchant_order_id");
  }

  if (purchase.provider !== FLITT_PAYMENT_PROVIDER) {
    return markFailed(db, row.id, row.paymentId, "provider_mismatch");
  }

  const orderId = purchase.merchantPaymentId.trim();
  const original = Number(purchase.priceAmount);
  const partial = amount + 1e-9 < original;

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
    provider: FLITT_PAYMENT_PROVIDER,
    status: "processing",
  });

  const provider = deps.createProvider?.() ?? FlittPaymentProvider.fromEnv();

  let payment;
  try {
    payment = await provider.getPayment(orderId);
  } catch (error) {
    const sanitized = sanitizeProviderError(error);
    if (error instanceof FlittCheckoutError && error.kind === "network") {
      return { outcome: "retry", reason: sanitized };
    }
    return markNeedsReview(db, row.id, row.paymentId, `reconcile_get_failed:${sanitized}`);
  }

  const expectedMinor = await expectedReversalMinor(db, row.paymentId);

  if (isRefundApplied(payment.providerStatus, payment.reversalAmountMinor, expectedMinor, payment.amountMinor)) {
    return markRefunded(db, row.id, row.paymentId, amount, payment.providerStatus);
  }

  const alreadyAttempted = isReverseAlreadyAttempted(row.providerReference, row.providerError);
  const reversalStillShort = payment.reversalAmountMinor + 1e-9 < expectedMinor;

  if (
    alreadyAttempted &&
    payment.providerStatus === FLITT_ORDER_STATUSES.approved &&
    reversalStillShort
  ) {
    // Same reverse_id is safe to retry until cumulative reversal reaches this job.
  } else if (alreadyAttempted) {
    return markNeedsReview(
      db,
      row.id,
      row.paymentId,
      `reverse_attempted_unresolved_status:${payment.providerStatus}:reversal=${payment.reversalAmountMinor}`,
    );
  }

  try {
    await provider.refund({
      orderId,
      amountMajor: amount,
      amountMinor: majorStringToFlittMinorUnits(
        typeof row.amount === "string" || typeof row.amount === "number"
          ? String(row.amount)
          : row.amount.toString(),
      ),
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

    if (
      error instanceof FlittCheckoutError &&
      (error.kind === "network" || error.kind === "provider_5xx" || error.kind === "protocol")
    ) {
      await persistAmbiguousReverseAttempted(db, row.id, sanitized);

      try {
        const after = await provider.getPayment(orderId);
        if (
          isRefundApplied(after.providerStatus, after.reversalAmountMinor, expectedMinor, after.amountMinor)
        ) {
          return markRefunded(db, row.id, row.paymentId, amount, after.providerStatus);
        }
        return { outcome: "retry", reason: `ambiguous_after_reverse:${sanitized}` };
      } catch (reconcileError) {
        return markNeedsReview(
          db,
          row.id,
          row.paymentId,
          `ambiguous_reverse_no_reconcile:${sanitized}:${sanitizeProviderError(reconcileError)}`,
        );
      }
    }

    if (error instanceof FlittCheckoutError && (error.kind === "validation" || error.kind === "provider_4xx")) {
      return markFailed(db, row.id, row.paymentId, sanitized);
    }

    return markNeedsReview(db, row.id, row.paymentId, sanitized);
  }

  try {
    const after = await provider.getPayment(orderId);
    if (isRefundApplied(after.providerStatus, after.reversalAmountMinor, expectedMinor, after.amountMinor)) {
      return markRefunded(db, row.id, row.paymentId, amount, after.providerStatus);
    }
    await db.refundRequest.updateMany({
      where: { id: row.id, status: "processing" },
      data: {
        providerReference: row.id,
        providerError: `awaiting_provider_status:${after.providerStatus}`.slice(0, 500),
      },
    });
    return { outcome: "retry", reason: `awaiting_status:${after.providerStatus}` };
  } catch (error) {
    return markNeedsReview(
      db,
      row.id,
      row.paymentId,
      `post_reverse_reconcile_failed:${sanitizeProviderError(error)}`,
    );
  }
}

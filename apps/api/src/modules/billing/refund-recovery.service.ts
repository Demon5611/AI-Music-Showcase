import { prisma } from "@ai-music/db";
import {
  hasRefundProviderAttemptMarker,
  REFUND_ENQUEUE_RECOVERY_GRACE_MS_DEFAULT,
} from "@ai-music/shared";
import { logSecurityEvent } from "../../common/security-log.js";
import { evaluateRefundRequeue } from "./refund-enqueue.service.js";
import {
  enqueueApprovedRefund,
  type EnqueueApprovedRefundDeps,
} from "./refund.service.js";

const RECOVERY_BATCH_SIZE = 20;

/**
 * Safe automatic re-enqueue for stale approved refunds.
 * Does not require credit-lot reservation.
 */
export async function reconcileApprovedRefundEnqueues(
  deps: EnqueueApprovedRefundDeps = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const graceMs = Number(
    env.REFUND_ENQUEUE_RECOVERY_GRACE_MS ?? REFUND_ENQUEUE_RECOVERY_GRACE_MS_DEFAULT,
  );
  if (!Number.isFinite(graceMs) || graceMs <= 0) {
    return 0;
  }

  const staleBefore = new Date(Date.now() - graceMs);

  const candidates = await prisma.refundRequest.findMany({
    where: {
      status: "approved",
      reviewedAt: { not: null, lt: staleBefore },
      providerReference: null,
    },
    take: RECOVERY_BATCH_SIZE,
    orderBy: { reviewedAt: "asc" },
    select: {
      id: true,
      userId: true,
      paymentId: true,
      provider: true,
      status: true,
      providerReference: true,
      providerError: true,
    },
  });

  let recovered = 0;

  for (const row of candidates) {
    if (hasRefundProviderAttemptMarker(row.providerReference, row.providerError)) {
      continue;
    }

    const eligibility = evaluateRefundRequeue({
      status: row.status,
      refundId: row.id,
      providerReference: row.providerReference,
      providerError: row.providerError,
    });

    if (!eligibility.ok) {
      continue;
    }

    try {
      const outcome = await enqueueApprovedRefund(row, deps);
      recovered += 1;
      logSecurityEvent("refund_enqueue_recovery_success", {
        refundRequestId: row.id,
        provider: row.provider,
        outcome,
      });
    } catch (error) {
      logSecurityEvent("refund_enqueue_recovery_failed", {
        refundRequestId: row.id,
        provider: row.provider,
        error: error instanceof Error ? error.message.slice(0, 500) : "enqueue_failed",
      });
    }
  }

  return recovered;
}

import {
  FLITT_PAYMENT_PROVIDER,
  flittRefundJobId,
  hasRefundProviderAttemptMarker,
  tbcRefundJobId,
} from "@ai-music/shared";

export type RefundRequeueOutcome = "queued" | "already_queued" | "not_requeueable";

/**
 * Admin/automatic requeue preflight.
 * Requires approved status + no durable provider attempt marker.
 * Does NOT require credit-lot reservation (merchant reserve ≠ user credits).
 */
export function evaluateRefundRequeue(input: {
  status: string;
  refundId: string;
  providerReference?: string | null;
  providerError?: string | null;
}): { ok: true } | { ok: false; reason: string } {
  void input.refundId;

  if (input.status !== "approved") {
    return { ok: false, reason: `STATUS_${input.status.toUpperCase()}` };
  }

  if (hasRefundProviderAttemptMarker(input.providerReference, input.providerError)) {
    return { ok: false, reason: "PROVIDER_ATTEMPT_EXISTS" };
  }

  return { ok: true };
}

export function refundJobIdForProvider(provider: string, refundRequestId: string): string {
  if (provider === FLITT_PAYMENT_PROVIDER) {
    return flittRefundJobId(refundRequestId);
  }
  return tbcRefundJobId(refundRequestId);
}

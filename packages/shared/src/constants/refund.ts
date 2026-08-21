import { createBullMqJobId } from "./bullmq-job-id.js";

export const REFUND_STATUSES = [
  "requested",
  "approved",
  "processing",
  "refunded",
  "rejected",
  "failed",
  "needs_review",
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_TERMINAL_STATUSES = [
  "refunded",
  "rejected",
  "failed",
  "needs_review",
] as const satisfies readonly RefundStatus[];

/** Statuses that count toward already-refunded money. */
export const REFUND_MONEY_COUNTED_STATUSES = [
  "approved",
  "processing",
  "refunded",
] as const satisfies readonly RefundStatus[];

export const TBC_REFUND_QUEUE_NAME = "tbc-refund";

export const TBC_REFUND_JOB_NAME = "tbc-refund";

export const TBC_REFUND_ATTEMPTS_DEFAULT = 5;

export const TBC_REFUND_BACKOFF_MS_DEFAULT = 5_000;

/**
 * Refund payment adapter mode.
 * `mock` is allowed only in development/staging — never production.
 */
export const TBC_REFUND_PROVIDER_MODES = ["real", "mock"] as const;

export type TbcRefundProviderMode = (typeof TBC_REFUND_PROVIDER_MODES)[number];

/** Deterministic mock scenarios selected via fixture metadata / payId — not user body. */
export const TBC_REFUND_MOCK_SCENARIOS = [
  "returned",
  "partial_returned",
  "rejected",
  "ambiguous_then_returned",
  "ambiguous_unresolved",
] as const;

export type TbcRefundMockScenario = (typeof TBC_REFUND_MOCK_SCENARIOS)[number];

/** providerPaymentId prefix for mock fixtures: tbc-mock:{scenario}:{suffix} */
export const TBC_REFUND_MOCK_PAY_ID_PREFIX = "tbc-mock";

export type TbcRefundJobPayload = {
  refundRequestId: string;
};

/** Deterministic BullMQ jobId — no colon separators. */
export function tbcRefundJobId(refundRequestId: string): string {
  return createBullMqJobId("tbc-refund", refundRequestId);
}

export function buildTbcRefundMockPayId(
  scenario: TbcRefundMockScenario,
  suffix: string,
): string {
  const clean = suffix.trim().replace(/:/g, "-");
  if (!clean) {
    throw new Error("mock payId suffix required");
  }
  return `${TBC_REFUND_MOCK_PAY_ID_PREFIX}:${scenario}:${clean}`;
}

/** Machine-readable credit-pack refund review codes (RefundRequest.rejectReason). */
export const CREDIT_PACK_REFUND_REVIEW_REASONS = {
  creditsConsumed: "PURCHASE_CREDITS_ALREADY_CONSUMED",
  partialRequiresReview: "PARTIAL_CREDIT_PACK_REFUND_REQUIRES_REVIEW",
  lotMissing: "PURCHASE_CREDIT_LOT_MISSING",
  clawbackInvariant: "CREDIT_CLAWBACK_INVARIANT_VIOLATION",
  creditsConsumedDuringProcessing: "REFUND_CREDITS_CONSUMED_DURING_PROCESSING",
} as const;

/** Default grace before automatic re-enqueue of stale approved refunds (ms). */
export const REFUND_ENQUEUE_RECOVERY_GRACE_MS_DEFAULT = 120_000;

/**
 * Durable provider reverse/cancel attempt marker on RefundRequest.
 * Survives BullMQ job removal, Worker restart, and Redis loss.
 */
export function hasRefundProviderAttemptMarker(
  providerReference: string | null | undefined,
  providerError: string | null | undefined,
): boolean {
  return (
    Boolean(providerReference?.trim()) ||
    Boolean(providerError?.startsWith("awaiting_provider_status:")) ||
    Boolean(providerError?.startsWith("ambiguous"))
  );
}

export function buildCreditPackRefundClawbackIdempotencyKey(refundRequestId: string): string {
  return `credit_pack_refund_clawback:${refundRequestId}`;
}

export function parseTbcRefundMockScenario(
  providerPaymentId: string,
): TbcRefundMockScenario | null {
  const trimmed = providerPaymentId.trim();
  const prefix = `${TBC_REFUND_MOCK_PAY_ID_PREFIX}:`;
  if (!trimmed.startsWith(prefix)) {
    return null;
  }
  const rest = trimmed.slice(prefix.length);
  const colon = rest.indexOf(":");
  if (colon <= 0) {
    return null;
  }
  const scenario = rest.slice(0, colon);
  if (
    !(TBC_REFUND_MOCK_SCENARIOS as readonly string[]).includes(scenario)
  ) {
    return null;
  }
  return scenario as TbcRefundMockScenario;
}

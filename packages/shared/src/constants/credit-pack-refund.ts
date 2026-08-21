import { CREDIT_PACK_REFUND_REVIEW_REASONS } from "./refund.js";

/**
 * Monetary refund approval eligibility.
 *
 * Credit-lot consumption must NOT gate monetary refund. Flitt/TBC merchant
 * reserve is owner financial risk, not a user credit freeze.
 *
 * Partial amounts still require admin review (amount policy), unrelated to lots.
 */
export function evaluateCreditPackRefundApproval(input: {
  mode: "full" | "partial";
  lot?: {
    grantAmountUnits: number;
    remainingAmountUnits: number;
    reservedAmountUnits: number;
  } | null;
}): { action: "approve" | "needs_review"; reason?: string } {
  void input.lot;

  if (input.mode === "partial") {
    return {
      action: "needs_review",
      reason: CREDIT_PACK_REFUND_REVIEW_REASONS.partialRequiresReview,
    };
  }

  return { action: "approve" };
}

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREDIT_PACK_REFUND_REVIEW_REASONS } from "./refund.js";
import { evaluateCreditPackRefundApproval } from "./credit-pack-refund.js";

describe("evaluateCreditPackRefundApproval", () => {
  const unused = {
    grantAmountUnits: 500_000,
    remainingAmountUnits: 500_000,
    reservedAmountUnits: 0,
  };

  it("approves full monetary refund regardless of lot remaining", () => {
    assert.deepEqual(evaluateCreditPackRefundApproval({ mode: "full", lot: unused }), {
      action: "approve",
    });
    assert.deepEqual(
      evaluateCreditPackRefundApproval({
        mode: "full",
        lot: { ...unused, remainingAmountUnits: 0 },
      }),
      { action: "approve" },
    );
  });

  it("approves full refund when lot is missing", () => {
    assert.deepEqual(evaluateCreditPackRefundApproval({ mode: "full", lot: null }), {
      action: "approve",
    });
  });

  it("approves full refund when lot would have been reserved under old policy", () => {
    assert.deepEqual(
      evaluateCreditPackRefundApproval({
        mode: "full",
        lot: { ...unused, reservedAmountUnits: 500_000 },
      }),
      { action: "approve" },
    );
  });

  it("needs review for credit-pack partial refunds (amount policy)", () => {
    const result = evaluateCreditPackRefundApproval({ mode: "partial", lot: unused });
    assert.equal(result.action, "needs_review");
    assert.equal(result.reason, CREDIT_PACK_REFUND_REVIEW_REASONS.partialRequiresReview);
  });
});

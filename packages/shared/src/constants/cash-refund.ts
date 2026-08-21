import { roundHalfUpDivide } from "../fx/usd-gel.js";

/** User-requested monetary refund scopes (not system credit compensation). */
export const CASH_REFUND_SCOPES = ["purchase_remainder", "operation"] as const;

export type CashRefundScope = (typeof CASH_REFUND_SCOPES)[number];

export const CASH_REFUND_REVIEW_REASONS = {
  operationAlreadyCreditCompensated: "OPERATION_ALREADY_CREDIT_COMPENSATED",
  operationSpansMultiplePurchases: "OPERATION_REFUND_SPANS_MULTIPLE_PURCHASES",
  operationNoPaidCredits: "OPERATION_REFUND_NO_PAID_CREDITS",
  operationAlreadyCashRefunded: "OPERATION_ALREADY_CASH_REFUNDED",
  purchaseRemainderZero: "PURCHASE_REMAINDER_ZERO",
  creditsConsumedDuringProcessing: "REFUND_CREDITS_CONSUMED_DURING_PROCESSING",
  lotMissing: "PURCHASE_CREDIT_LOT_MISSING",
} as const;

/**
 * Cumulative cash refund in minor units from credit entitlement.
 * Prevents independent-round drift across partial refunds.
 */
export function computeCumulativeCashRefundMinor(input: {
  originalAmountMinor: bigint;
  grantedCreditUnits: number;
  /** Already counted monetized credit units (approved/processing/refunded). */
  alreadyRefundedCreditUnits: number;
  /** Credit units for this refund. */
  thisRefundCreditUnits: number;
}): { targetRefundedMinor: bigint; previousTargetMinor: bigint; incrementalRefundMinor: bigint } {
  const grant = BigInt(input.grantedCreditUnits);
  if (grant <= 0n) {
    throw new Error("grantedCreditUnits must be positive");
  }
  if (input.thisRefundCreditUnits < 0 || input.alreadyRefundedCreditUnits < 0) {
    throw new Error("credit units must be non-negative");
  }
  if (input.alreadyRefundedCreditUnits + input.thisRefundCreditUnits > input.grantedCreditUnits) {
    throw new Error("cash refund credit units exceed grant");
  }

  const previousTargetMinor = roundHalfUpDivide(
    input.originalAmountMinor * BigInt(input.alreadyRefundedCreditUnits),
    grant,
  );
  const targetRefundedMinor = roundHalfUpDivide(
    input.originalAmountMinor * BigInt(input.alreadyRefundedCreditUnits + input.thisRefundCreditUnits),
    grant,
  );
  const incrementalRefundMinor = targetRefundedMinor - previousTargetMinor;

  return { targetRefundedMinor, previousTargetMinor, incrementalRefundMinor };
}

/** Format minor units (tetri) as major decimal string with 2 places. */
export function minorUnitsToMajorDecimalString(minor: bigint): string {
  if (minor < 0n) {
    throw new Error("minor units must be non-negative");
  }
  const whole = minor / 100n;
  const frac = (minor % 100n).toString().padStart(2, "0");
  return `${whole.toString()}.${frac}`;
}

export function majorDecimalStringToMinorUnits(major: string): bigint {
  const trimmed = major.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("invalid major amount");
  }
  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  return BigInt(wholeRaw) * 100n + BigInt(fracRaw.padEnd(2, "0"));
}

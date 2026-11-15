import { CHECKOUTGATEWAY_MINOR_UNITS_EXPONENT } from "@ai-music/shared";
import { CheckoutgatewayCheckoutError } from "./checkoutgateway-errors.js";

const SCALE = 10 ** CHECKOUTGATEWAY_MINOR_UNITS_EXPONENT;

/**
 * Convert major currency units (snapshot `priceAmount`) to Checkoutgateway integer amount
 * (GEL tetri, no decimal separator). Centralized — do not inline * 100.
 */
export function toCheckoutgatewayMinorUnits(majorAmount: number): number {
  if (!Number.isFinite(majorAmount) || majorAmount <= 0) {
    throw new CheckoutgatewayCheckoutError("Invalid checkout amount", "validation", {
      code: "CHECKOUTGATEWAY_AMOUNT_INVALID",
    });
  }

  const minor = Math.round(majorAmount * SCALE);
  const roundTrip = minor / SCALE;
  if (Math.abs(roundTrip - majorAmount) > 1e-9) {
    throw new CheckoutgatewayCheckoutError("Amount must have at most 2 decimal places", "validation", {
      code: "CHECKOUTGATEWAY_AMOUNT_PRECISION",
    });
  }

  return minor;
}

export function fromCheckoutgatewayMinorUnits(minorAmount: number): number {
  if (!Number.isFinite(minorAmount) || minorAmount < 0) {
    throw new CheckoutgatewayCheckoutError("Invalid Checkoutgateway minor amount", "validation", {
      code: "CHECKOUTGATEWAY_MINOR_AMOUNT_INVALID",
    });
  }
  return minorAmount / SCALE;
}

/** Checkoutgateway sends amount as integer or numeric string. */
export function parseCheckoutgatewayAmountField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * Convert a decimal major-unit string ("78.88") to integer tetri without IEEE-754.
 * Accepts at most 2 decimal places.
 */
export function majorStringToCheckoutgatewayMinorUnits(major: string): number {
  const trimmed = major.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new CheckoutgatewayCheckoutError("Invalid checkout amount", "validation", {
      code: "CHECKOUTGATEWAY_AMOUNT_INVALID",
    });
  }
  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  const whole = BigInt(wholeRaw);
  const frac = BigInt(fracRaw.padEnd(2, "0"));
  const minor = whole * 100n + frac;
  if (minor <= 0n) {
    throw new CheckoutgatewayCheckoutError("Invalid checkout amount", "validation", {
      code: "CHECKOUTGATEWAY_AMOUNT_INVALID",
    });
  }
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new CheckoutgatewayCheckoutError("Amount is too large", "validation", {
      code: "CHECKOUTGATEWAY_AMOUNT_OVERFLOW",
    });
  }
  return Number(minor);
}

export function assertCheckoutgatewayMinorUnits(amountMinor: number): number {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new CheckoutgatewayCheckoutError("Checkoutgateway amount must be a positive integer", "validation", {
      code: "CHECKOUTGATEWAY_AMOUNT_INVALID",
    });
  }
  return amountMinor;
}

import { FLITT_MINOR_UNITS_EXPONENT } from "@ai-music/shared";
import { FlittCheckoutError } from "./flitt-errors.js";

const SCALE = 10 ** FLITT_MINOR_UNITS_EXPONENT;

/**
 * Convert major currency units (snapshot `priceAmount`) to Flitt integer amount
 * (GEL tetri, no decimal separator). Centralized — do not inline * 100.
 */
export function toFlittMinorUnits(majorAmount: number): number {
  if (!Number.isFinite(majorAmount) || majorAmount <= 0) {
    throw new FlittCheckoutError("Invalid checkout amount", "validation", {
      code: "FLITT_AMOUNT_INVALID",
    });
  }

  const minor = Math.round(majorAmount * SCALE);
  const roundTrip = minor / SCALE;
  if (Math.abs(roundTrip - majorAmount) > 1e-9) {
    throw new FlittCheckoutError("Amount must have at most 2 decimal places", "validation", {
      code: "FLITT_AMOUNT_PRECISION",
    });
  }

  return minor;
}

export function fromFlittMinorUnits(minorAmount: number): number {
  if (!Number.isFinite(minorAmount) || minorAmount < 0) {
    throw new FlittCheckoutError("Invalid Flitt minor amount", "validation", {
      code: "FLITT_MINOR_AMOUNT_INVALID",
    });
  }
  return minorAmount / SCALE;
}

/** Flitt sends amount as integer or numeric string. */
export function parseFlittAmountField(value: unknown): number | null {
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
export function majorStringToFlittMinorUnits(major: string): number {
  const trimmed = major.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new FlittCheckoutError("Invalid checkout amount", "validation", {
      code: "FLITT_AMOUNT_INVALID",
    });
  }
  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  const whole = BigInt(wholeRaw);
  const frac = BigInt(fracRaw.padEnd(2, "0"));
  const minor = whole * 100n + frac;
  if (minor <= 0n) {
    throw new FlittCheckoutError("Invalid checkout amount", "validation", {
      code: "FLITT_AMOUNT_INVALID",
    });
  }
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FlittCheckoutError("Amount is too large", "validation", {
      code: "FLITT_AMOUNT_OVERFLOW",
    });
  }
  return Number(minor);
}

export function assertFlittMinorUnits(amountMinor: number): number {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new FlittCheckoutError("Flitt amount must be a positive integer", "validation", {
      code: "FLITT_AMOUNT_INVALID",
    });
  }
  return amountMinor;
}

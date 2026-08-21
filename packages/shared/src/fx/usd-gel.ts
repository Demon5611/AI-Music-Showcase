/**
 * USD→GEL conversion for Flitt checkout.
 * Integer/bigint arithmetic only — no IEEE-754 money math.
 */

export const FX_BASE_CURRENCY = "USD" as const;
export const FX_QUOTE_CURRENCY = "GEL" as const;

/** ISO-4217 exponent for USD and GEL. */
export const MONEY_MINOR_EXPONENT = 2;

/** Max decimal places accepted on an FX rate. */
export const FX_RATE_MAX_SCALE = 8;

export type FxQuote = {
  baseCurrency: typeof FX_BASE_CURRENCY;
  quoteCurrency: typeof FX_QUOTE_CURRENCY;
  /** Exact decimal string, e.g. "2.7200". */
  rate: string;
  quotedAt: Date;
  source: string;
};

export class FxConversionError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "FxConversionError";
    this.code = code;
  }
}

export type ConvertedGelCharge = {
  gelMajor: string;
  gelTetri: number;
};

type ParsedDecimal = {
  unscaled: bigint;
  scale: number;
};

function parsePositiveDecimal(value: string, name: string): ParsedDecimal {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new FxConversionError(`Invalid ${name}`, "FX_DECIMAL_INVALID");
  }

  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const scale = fracRaw.length;
  const unscaled = BigInt(`${whole}${fracRaw}` || "0");
  if (unscaled <= 0n) {
    throw new FxConversionError(`${name} must be positive`, "FX_DECIMAL_NOT_POSITIVE");
  }

  return { unscaled, scale };
}

function scaleUp(unscaled: bigint, fromScale: number, toScale: number): bigint {
  if (toScale < fromScale) {
    throw new FxConversionError("Cannot scale decimal down without rounding", "FX_SCALE_INVALID");
  }
  const delta = toScale - fromScale;
  return unscaled * 10n ** BigInt(delta);
}

/** Round half-up of numerator/denominator for non-negative integers. */
export function roundHalfUpDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new FxConversionError("Invalid rounding denominator", "FX_ROUND_INVALID");
  }
  if (numerator < 0n) {
    throw new FxConversionError("Negative money is not supported", "FX_NEGATIVE");
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n >= denominator) {
    return quotient + 1n;
  }
  return quotient;
}

function formatUnscaledDecimal(unscaled: bigint, scale: number): string {
  const padded = unscaled.toString().padStart(scale + 1, "0");
  if (scale === 0) {
    return padded.replace(/^0+(?=\d)/, "") || "0";
  }
  const wholeRaw = padded.slice(0, -scale).replace(/^0+(?=\d)/, "") || "0";
  const frac = padded.slice(-scale).replace(/0+$/, "");
  return frac.length === 0 ? wholeRaw : `${wholeRaw}.${frac}`;
}

/**
 * Divide a positive decimal string by a positive integer (NBG quantity/nominal).
 * Exact when possible; otherwise half-up to FX_RATE_MAX_SCALE.
 */
export function dividePositiveDecimalByInteger(value: string, divisor: number): string {
  if (!Number.isInteger(divisor) || divisor <= 0) {
    throw new FxConversionError("Invalid FX nominal", "FX_NOMINAL_INVALID");
  }

  const parsed = parsePositiveDecimal(value, "FX rate");
  const denom = BigInt(divisor);
  let unscaled = parsed.unscaled;
  let scale = parsed.scale;

  while (unscaled % denom !== 0n && scale < FX_RATE_MAX_SCALE) {
    unscaled *= 10n;
    scale += 1;
  }

  const quotient =
    unscaled % denom === 0n ? unscaled / denom : roundHalfUpDivide(unscaled, denom);
  if (quotient <= 0n) {
    throw new FxConversionError("FX rate must be positive", "FX_DECIMAL_NOT_POSITIVE");
  }

  return formatUnscaledDecimal(quotient, scale);
}

export function gelTetriToMajorString(tetri: number): string {
  if (!Number.isInteger(tetri) || tetri <= 0) {
    throw new FxConversionError("GEL tetri must be a positive integer", "FX_TETRI_INVALID");
  }
  const value = BigInt(tetri);
  const whole = value / 100n;
  const frac = value % 100n;
  return `${whole.toString()}.${frac.toString().padStart(2, "0")}`;
}

/**
 * Convert USD major units by an FX rate into GEL tetri (integer) and GEL major ("78.88").
 * Rounding: half-up to 2 decimal places / tetri.
 */
export function convertUsdMajorToGel(usdMajor: string | number, rate: string): ConvertedGelCharge {
  const usd = parsePositiveDecimal(String(usdMajor), "USD amount");
  if (usd.scale > MONEY_MINOR_EXPONENT) {
    throw new FxConversionError("USD amount must have at most 2 decimal places", "FX_USD_PRECISION");
  }

  const fx = parsePositiveDecimal(rate, "FX rate");
  if (fx.scale > FX_RATE_MAX_SCALE) {
    throw new FxConversionError("FX rate has too many decimal places", "FX_RATE_PRECISION");
  }

  const usdCents = scaleUp(usd.unscaled, usd.scale, MONEY_MINOR_EXPONENT);
  const denominator = 10n ** BigInt(fx.scale);
  const tetriBig = roundHalfUpDivide(usdCents * fx.unscaled, denominator);
  if (tetriBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FxConversionError("Converted GEL amount is too large", "FX_AMOUNT_OVERFLOW");
  }

  const gelTetri = Number(tetriBig);
  return {
    gelTetri,
    gelMajor: gelTetriToMajorString(gelTetri),
  };
}

export function assertUsdGelQuote(quote: FxQuote): FxQuote {
  if (quote.baseCurrency !== FX_BASE_CURRENCY || quote.quoteCurrency !== FX_QUOTE_CURRENCY) {
    throw new FxConversionError("FX quote must be USD→GEL", "FX_PAIR_UNSUPPORTED");
  }
  if (!quote.source.trim()) {
    throw new FxConversionError("FX quote source is required", "FX_SOURCE_MISSING");
  }
  if (!(quote.quotedAt instanceof Date) || Number.isNaN(quote.quotedAt.getTime())) {
    throw new FxConversionError("FX quote timestamp is invalid", "FX_QUOTED_AT_INVALID");
  }
  parsePositiveDecimal(quote.rate, "FX rate");
  return quote;
}

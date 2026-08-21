/**
 * Official NBG USD→GEL quote for Flitt checkout.
 * Host is fixed (SSRF-safe). Rate math stays on decimal strings / bigint.
 */

import { FxQuoteUnavailableError, type FxRateProvider } from "./fx-rate-provider.js";
import {
  FX_BASE_CURRENCY,
  FX_QUOTE_CURRENCY,
  assertUsdGelQuote,
  dividePositiveDecimalByInteger,
  type FxQuote,
} from "./usd-gel.js";

export const NBG_FX_SOURCE = "nbg" as const;
export const NBG_FX_HOST = "nbg.gov.ge";
export const NBG_USD_GEL_URL =
  "https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json?currencies=USD";

/** Abort hanging NBG HTTP before checkout waits too long. */
export const NBG_FX_TIMEOUT_MS = 2_500;
/** Reuse a successful fetch at most this long. */
export const NBG_FX_CACHE_TTL_MS = 60 * 60 * 1000;
/**
 * Accept NBG validFromDate this many Tbilisi calendar days before today
 * (weekends / holidays without a new bulletin).
 */
export const NBG_FX_MAX_BULLETIN_AGE_DAYS = 5;
/** Already-published next-day bulletin (typical after ~17:00 Tbilisi). */
export const NBG_FX_MAX_FUTURE_DAYS = 1;
export const NBG_TZ = "Asia/Tbilisi";

export type NbgUsdGelHttpFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type NbgUsdGelFxProviderOptions = {
  fetchImpl?: NbgUsdGelHttpFetch;
  now?: () => Date;
  timeoutMs?: number;
  cacheTtlMs?: number;
};

type CachedQuote = {
  quote: FxQuote;
  fetchedAtMs: number;
};

type NbgCurrencyRow = {
  code?: unknown;
  quantity?: unknown;
  rateFormated?: unknown;
  validFromDate?: unknown;
  date?: unknown;
};

type NbgBulletin = {
  date?: unknown;
  currencies?: unknown;
};

export function nbgCalendarDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NBG_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function daysBetweenCalendarDates(fromYmd: string, toYmd: string): number {
  const fromMs = Date.parse(`${fromYmd}T00:00:00.000Z`);
  const toMs = Date.parse(`${toYmd}T00:00:00.000Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

/**
 * Freshness uses NBG `validFromDate` in Asia/Tbilisi, not a rolling 24h window.
 * Allows last banking-day bulletins across weekends, and the already-published
 * next calendar day's rate.
 */
export function isNbgBulletinFresh(validFrom: Date, now: Date): boolean {
  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(now.getTime())) {
    return false;
  }
  const ageDays = daysBetweenCalendarDates(nbgCalendarDate(validFrom), nbgCalendarDate(now));
  if (ageDays < -NBG_FX_MAX_FUTURE_DAYS) {
    return false;
  }
  if (ageDays > NBG_FX_MAX_BULLETIN_AGE_DAYS) {
    return false;
  }
  return true;
}

function assertTrustedNbgUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FxQuoteUnavailableError("NBG FX URL is invalid");
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== NBG_FX_HOST) {
    throw new FxQuoteUnavailableError("NBG FX host is not trusted");
  }
}

function readPositiveInteger(value: unknown, name: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  throw new FxQuoteUnavailableError(`NBG ${name} is invalid`);
}

function readRateString(row: NbgCurrencyRow): string {
  if (typeof row.rateFormated === "string" && row.rateFormated.trim() !== "") {
    return row.rateFormated.trim();
  }
  throw new FxQuoteUnavailableError("NBG USD rate is malformed");
}

function readIsoDate(value: unknown, fallback?: unknown): Date {
  const raw = typeof value === "string" ? value : typeof fallback === "string" ? fallback : "";
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.getTime())) {
    throw new FxQuoteUnavailableError("NBG effective date is invalid");
  }
  return parsed;
}

function findUsdRow(payload: unknown): NbgCurrencyRow {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new FxQuoteUnavailableError("NBG FX response is malformed");
  }
  const bulletin = payload[0] as NbgBulletin;
  if (!Array.isArray(bulletin.currencies)) {
    throw new FxQuoteUnavailableError("NBG FX response is malformed");
  }
  const usd = bulletin.currencies.find((row): row is NbgCurrencyRow => {
    if (!row || typeof row !== "object") {
      return false;
    }
    const code = (row as NbgCurrencyRow).code;
    return typeof code === "string" && code.trim().toUpperCase() === "USD";
  });
  if (!usd) {
    throw new FxQuoteUnavailableError("NBG USD rate is missing");
  }
  return usd;
}

export function parseNbgUsdGelQuote(payload: unknown, now: Date): FxQuote {
  const usd = findUsdRow(payload);
  const quantity = readPositiveInteger(usd.quantity, "quantity");
  const ratePerUsd = dividePositiveDecimalByInteger(readRateString(usd), quantity);
  const validFrom = readIsoDate(usd.validFromDate, (payload as NbgBulletin[])[0]?.date);

  if (!isNbgBulletinFresh(validFrom, now)) {
    throw new FxQuoteUnavailableError("NBG USD/GEL quote is not fresh");
  }

  return assertUsdGelQuote({
    baseCurrency: FX_BASE_CURRENCY,
    quoteCurrency: FX_QUOTE_CURRENCY,
    rate: ratePerUsd,
    quotedAt: validFrom,
    source: NBG_FX_SOURCE,
  });
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "AbortError")
  );
}

function isRetryableFetchError(error: unknown): boolean {
  if (isAbortError(error)) {
    return true;
  }
  if (error instanceof FxQuoteUnavailableError) {
    return /HTTP 50[0234]|network|timed out/i.test(error.message);
  }
  if (error instanceof TypeError) {
    return true;
  }
  return false;
}

export class NbgUsdGelFxProvider implements FxRateProvider {
  private readonly fetchImpl: NbgUsdGelHttpFetch;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private cache: CachedQuote | null = null;

  constructor(options: NbgUsdGelFxProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? NBG_FX_TIMEOUT_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? NBG_FX_CACHE_TTL_MS;
  }

  async getUsdGelQuote(): Promise<FxQuote> {
    const now = this.now();
    const cached = this.readFreshCache(now);
    if (cached) {
      return cached;
    }

    try {
      return await this.fetchQuote(now);
    } catch (error) {
      if (!isRetryableFetchError(error)) {
        throw error instanceof FxQuoteUnavailableError
          ? error
          : new FxQuoteUnavailableError("USD/GEL FX quote is unavailable");
      }
      return this.fetchQuote(this.now());
    }
  }

  private readFreshCache(now: Date): FxQuote | null {
    if (!this.cache) {
      return null;
    }
    if (now.getTime() - this.cache.fetchedAtMs > this.cacheTtlMs) {
      return null;
    }
    if (!isNbgBulletinFresh(this.cache.quote.quotedAt, now)) {
      return null;
    }
    return {
      ...this.cache.quote,
      quotedAt: new Date(this.cache.quote.quotedAt.getTime()),
    };
  }

  private async fetchQuote(now: Date): Promise<FxQuote> {
    assertTrustedNbgUrl(NBG_USD_GEL_URL);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(NBG_USD_GEL_URL, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new FxQuoteUnavailableError("NBG FX request timed out");
      }
      throw new FxQuoteUnavailableError("NBG FX network error");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new FxQuoteUnavailableError(`NBG FX HTTP ${response.status}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FxQuoteUnavailableError("NBG FX response is not JSON");
    }

    const quote = parseNbgUsdGelQuote(payload, now);
    this.cache = { quote, fetchedAtMs: now.getTime() };
    return {
      ...quote,
      quotedAt: new Date(quote.quotedAt.getTime()),
    };
  }
}

/**
 * Showcase-safe Mureka provider economics placeholders.
 *
 * Real provider unit costs, negotiated rates, and vendor correspondence
 * are intentionally omitted from this public portfolio repository.
 *
 * Runtime product billing uses user-facing credit costs
 * (`OPERATION_COST_*` / `MUREKA_CREDIT_COSTS`), not these placeholders.
 *
 * Output count (product invariant):
 * - Provider APIs may default `n` to more than one output when omitted.
 * - This product always sends explicit `n: MUREKA_OUTPUT_COUNT` (= 1).
 */

export const USD_MICROS_PER_USD = 1_000_000;

export const MUREKA_VARIANT_COUNTS = [1, 2, 3] as const;
export type MurekaVariantCount = (typeof MUREKA_VARIANT_COUNTS)[number];

/**
 * Lyrics-to-Song output count — always sent as request field `n`.
 */
export const MUREKA_OUTPUT_COUNT = 1 satisfies MurekaVariantCount;

/** @deprecated Use {@link MUREKA_OUTPUT_COUNT}. Same product invariant value. */
export const MUREKA_DEFAULT_VARIANT_COUNT = MUREKA_OUTPUT_COUNT;

/**
 * Intentionally fake showcase placeholder (1 USD micro).
 * Not a real provider tariff. Do not use for commercial decisions.
 */
export const MUREKA_LYRICS_TO_SONG_USD_MICROS_PER_OUTPUT = 1;

export const MUREKA_ECONOMICS = {
  confirmedAt: "showcase",
  source: "showcase-placeholder",
  tariffModel: "showcase",
  lyricsToSongUsdMicrosPerOutput: MUREKA_LYRICS_TO_SONG_USD_MICROS_PER_OUTPUT,
  /** Product invariant — always 1. */
  defaultVariantCount: MUREKA_OUTPUT_COUNT,
  outputCount: MUREKA_OUTPUT_COUNT,
  clonedVocalId: {
    supportedWithLyricsToSong: true,
    sameLyricsToSongRate: true,
  },
  vocalCloneCreate: {
    status: "unverified" as const,
    note: "Provider vocal-clone economics are not published in the showcase repository.",
    historicalSnapshotUsd: null,
    historicalSnapshotDate: null,
    usedInRuntimeBilling: false,
  },
  temporaryStagingConcurrency: {
    maxConcurrent: 1,
    confirmedAt: "showcase",
    productionContract: false,
  },
} as const;

export type ParseMurekaVariantCountResult =
  | { ok: true; value: MurekaVariantCount }
  | { ok: false };

export function isMurekaVariantCount(value: unknown): value is MurekaVariantCount {
  return value === 1 || value === 2 || value === 3;
}

export function parseMurekaVariantCount(value: unknown): ParseMurekaVariantCountResult {
  if (typeof value !== "number" || !Number.isInteger(value) || !isMurekaVariantCount(value)) {
    return { ok: false };
  }

  return { ok: true, value };
}

export function resolveMurekaVariantCount(
  value: unknown,
  fallback: MurekaVariantCount = MUREKA_OUTPUT_COUNT,
): MurekaVariantCount {
  const parsed = parseMurekaVariantCount(value);
  return parsed.ok ? parsed.value : fallback;
}

/**
 * Estimated Lyrics-to-Song placeholder cost in USD micros (showcase only).
 * Throws on invalid variantCount — do not silently bill a fallback.
 */
export function estimateMurekaLyricsToSongUsdMicros(variantCount: unknown): number {
  const parsed = parseMurekaVariantCount(variantCount);
  if (!parsed.ok) {
    throw new Error("Invalid Mureka variantCount; expected 1, 2, or 3");
  }

  return MUREKA_LYRICS_TO_SONG_USD_MICROS_PER_OUTPUT * parsed.value;
}

/** Formats USD micros as a fixed 3-decimal string. */
export function formatUsdFromMicros(micros: number): string {
  const negative = micros < 0;
  const abs = Math.abs(micros);
  const whole = Math.trunc(abs / USD_MICROS_PER_USD);
  const millis = Math.round((abs % USD_MICROS_PER_USD) / 1_000);
  const frac = String(millis).padStart(3, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** Prometheus / float display only — never for ledger math. */
export function usdMicrosToNumber(micros: number): number {
  return micros / USD_MICROS_PER_USD;
}

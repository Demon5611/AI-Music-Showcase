/**
 * Showcase-safe Audioengine provider economics placeholders.
 *
 * Real provider unit costs, negotiated rates, and vendor correspondence
 * are intentionally omitted from this public portfolio repository.
 *
 * Runtime product billing uses user-facing credit costs
 * (`OPERATION_COST_*` / `AUDIOENGINE_CREDIT_COSTS`), not these placeholders.
 *
 * Output count (product invariant):
 * - Provider APIs may default `n` to more than one output when omitted.
 * - This product always sends explicit `n: AUDIOENGINE_OUTPUT_COUNT` (= 1).
 */

export const USD_MICROS_PER_USD = 1_000_000;

export const AUDIOENGINE_VARIANT_COUNTS = [1, 2, 3] as const;
export type AudioengineVariantCount = (typeof AUDIOENGINE_VARIANT_COUNTS)[number];

/**
 * Lyrics-to-Song output count — always sent as request field `n`.
 */
export const AUDIOENGINE_OUTPUT_COUNT = 1 satisfies AudioengineVariantCount;

/** @deprecated Use {@link AUDIOENGINE_OUTPUT_COUNT}. Same product invariant value. */
export const AUDIOENGINE_DEFAULT_VARIANT_COUNT = AUDIOENGINE_OUTPUT_COUNT;

/**
 * Intentionally fake showcase placeholder (1 USD micro).
 * Not a real provider tariff. Do not use for commercial decisions.
 */
export const AUDIOENGINE_LYRICS_TO_SONG_USD_MICROS_PER_OUTPUT = 1;

export const AUDIOENGINE_ECONOMICS = {
  confirmedAt: "showcase",
  source: "showcase-placeholder",
  tariffModel: "showcase",
  lyricsToSongUsdMicrosPerOutput: AUDIOENGINE_LYRICS_TO_SONG_USD_MICROS_PER_OUTPUT,
  /** Product invariant — always 1. */
  defaultVariantCount: AUDIOENGINE_OUTPUT_COUNT,
  outputCount: AUDIOENGINE_OUTPUT_COUNT,
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

export type ParseAudioengineVariantCountResult =
  | { ok: true; value: AudioengineVariantCount }
  | { ok: false };

export function isAudioengineVariantCount(value: unknown): value is AudioengineVariantCount {
  return value === 1 || value === 2 || value === 3;
}

export function parseAudioengineVariantCount(value: unknown): ParseAudioengineVariantCountResult {
  if (typeof value !== "number" || !Number.isInteger(value) || !isAudioengineVariantCount(value)) {
    return { ok: false };
  }

  return { ok: true, value };
}

export function resolveAudioengineVariantCount(
  value: unknown,
  fallback: AudioengineVariantCount = AUDIOENGINE_OUTPUT_COUNT,
): AudioengineVariantCount {
  const parsed = parseAudioengineVariantCount(value);
  return parsed.ok ? parsed.value : fallback;
}

/**
 * Estimated Lyrics-to-Song placeholder cost in USD micros (showcase only).
 * Throws on invalid variantCount — do not silently bill a fallback.
 */
export function estimateAudioengineLyricsToSongUsdMicros(variantCount: unknown): number {
  const parsed = parseAudioengineVariantCount(variantCount);
  if (!parsed.ok) {
    throw new Error("Invalid Audioengine variantCount; expected 1, 2, or 3");
  }

  return AUDIOENGINE_LYRICS_TO_SONG_USD_MICROS_PER_OUTPUT * parsed.value;
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

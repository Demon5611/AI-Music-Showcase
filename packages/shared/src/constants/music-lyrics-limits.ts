import { FREE_TIER_DEFAULT_DURATION_SEC } from "./music-combo-styles.js";
import { resolveEffectiveDurationSecForPlan } from "./music-duration.js";
import type { PlanId } from "./plans.js";
import { SUNO_LYRICS_PROMPT_MAX_LENGTH, type VocalGender } from "./vocal-gender.js";
import {
  buildLyricsLanguageInstruction,
  buildLyricsGenerationProviderPrompt,
  resolveLyricsPromptOverheadLength,
  type ResolvedLyricsLanguage,
} from "../lyrics-language/index.js";

/** Matches Suno custom-mode lyrics truncation in ai-providers. */
export const SUNO_LYRICS_CHARS_PER_SEC = 12;

export const SUNO_LYRICS_MIN_CHARS = 80;

export const SUNO_LYRICS_MANUAL_MAX_LENGTH = 3000;

export function resolveLyricsMaxLengthForDurationSec(durationSec: number): number {
  if (durationSec <= 0) {
    return SUNO_LYRICS_MANUAL_MAX_LENGTH;
  }

  return Math.max(
    SUNO_LYRICS_MIN_CHARS,
    Math.floor(durationSec * SUNO_LYRICS_CHARS_PER_SEC),
  );
}

export const FREE_TIER_LYRICS_MAX_LENGTH = resolveLyricsMaxLengthForDurationSec(
  FREE_TIER_DEFAULT_DURATION_SEC,
);

export function resolveLyricsDurationSecForPlan(
  planId: PlanId,
  selectedDurationSec: number,
): number {
  return resolveEffectiveDurationSecForPlan(planId, selectedDurationSec);
}

export function resolveManualLyricsMaxLength(
  planId: PlanId,
  selectedDurationSec: number,
): number {
  const durationSec = resolveLyricsDurationSecForPlan(planId, selectedDurationSec);

  return resolveLyricsMaxLengthForDurationSec(durationSec);
}

/** Worst-case language instruction length for brief budget (English name). */
const SAMPLE_LANGUAGE_FOR_BUDGET: ResolvedLyricsLanguage = {
  code: "en",
  englishName: "English",
  source: "default_fallback",
};

export function buildDurationAwareLyricsGenerationSuffix(durationSec: number): string {
  return `\n~${durationSec}s: one short verse and chorus.`;
}

export function resolveLyricsBriefMaxLength(
  vocalGender: VocalGender | null | undefined,
  lyricsDurationSec: number,
  languageInstructionLength?: number,
  /** When omitted/auto, overhead uses the longest gender grammar line. */
  languageCode?: ResolvedLyricsLanguage["code"] | null,
): number {
  const instructionLength =
    languageInstructionLength ??
    buildLyricsLanguageInstruction(SAMPLE_LANGUAGE_FOR_BUDGET).length;
  const overhead = resolveLyricsPromptOverheadLength(
    vocalGender,
    lyricsDurationSec,
    instructionLength,
    languageCode,
  );

  return Math.max(32, SUNO_LYRICS_PROMPT_MAX_LENGTH - overhead);
}

/**
 * @deprecated Use buildLyricsGenerationProviderPrompt with resolved language.
 * Kept for callers that have not yet wired language resolution.
 */
export function buildDurationAwareLyricsGenerationPrompt(
  brief: string,
  vocalGender: VocalGender | null | undefined,
  lyricsDurationSec: number,
  resolvedLanguage: ResolvedLyricsLanguage = SAMPLE_LANGUAGE_FOR_BUDGET,
): string {
  return buildLyricsGenerationProviderPrompt({
    brief,
    resolvedLanguage,
    vocalGender,
    lyricsDurationSec,
  });
}

export function truncateLyricsForDuration(text: string, durationSec: number): string {
  const max = resolveLyricsMaxLengthForDurationSec(durationSec);
  const trimmed = text.trim();

  if (trimmed.length <= max) {
    return trimmed;
  }

  const slice = trimmed.slice(0, max);
  const lastBreak = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
  const cut = lastBreak > max * 0.6 ? slice.slice(0, lastBreak) : slice;

  return `${cut.trimEnd()}...`;
}

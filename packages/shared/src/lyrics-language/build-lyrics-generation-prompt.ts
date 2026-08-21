import type { VocalGender } from "../constants/vocal-gender.js";
import { SUNO_LYRICS_PROMPT_MAX_LENGTH } from "../constants/vocal-gender.js";
import { buildLyricsLanguageInstruction } from "./build-lyrics-language-instruction.js";
import {
  buildNarratorGenderLine,
  resolveMaxGenderNarratorLength,
} from "./gender-grammar-examples.js";
import type { ResolvedLyricsLanguage, ResolvedLyricsLanguageCode } from "./lyrics-language.js";

/**
 * Ordered provider prompt for POST /lyrics within Suno’s 200-char hard limit:
 * language → user brief → narrator (with grammar samples) → structure.
 */
export function buildNarratorGenderRequirement(
  vocalGender: VocalGender,
  languageCode?: ResolvedLyricsLanguageCode | null,
): string {
  return buildNarratorGenderLine(vocalGender, languageCode);
}

export function buildStructureRequirement(durationSec: number): string {
  return `~${durationSec}s: one short verse and chorus.`;
}

export function resolveLyricsPromptOverheadLength(
  vocalGender: VocalGender | null | undefined,
  lyricsDurationSec: number,
  languageInstructionLength: number,
  languageCode?: ResolvedLyricsLanguageCode | null,
): number {
  let narrative = 0;

  if (vocalGender) {
    // Auto / unknown code: budget for the longest gender line so UI never overshoots.
    const genderLen =
      !languageCode || languageCode === "multi"
        ? resolveMaxGenderNarratorLength(vocalGender)
        : buildNarratorGenderRequirement(vocalGender, languageCode).length;
    narrative = genderLen + 1;
  }

  const structure = buildStructureRequirement(lyricsDurationSec).length + 1;

  return languageInstructionLength + 1 + narrative + structure;
}

export function buildLyricsGenerationProviderPrompt(input: {
  brief: string;
  resolvedLanguage: ResolvedLyricsLanguage;
  vocalGender?: VocalGender | null;
  lyricsDurationSec: number;
}): string {
  const languageBlock = buildLyricsLanguageInstruction(input.resolvedLanguage);
  const narrativeBlock = input.vocalGender
    ? buildNarratorGenderRequirement(input.vocalGender, input.resolvedLanguage.code)
    : "";
  const structureBlock = buildStructureRequirement(input.lyricsDurationSec);
  const brief = input.brief.trim();

  const suffixParts = [narrativeBlock, structureBlock].filter(Boolean);
  const suffix = suffixParts.length > 0 ? `\n${suffixParts.join("\n")}` : "";
  const prefix = `${languageBlock}\n`;
  const briefBudget = Math.max(8, SUNO_LYRICS_PROMPT_MAX_LENGTH - prefix.length - suffix.length);
  const clippedBrief = brief.slice(0, briefBudget);
  const assembled = `${prefix}${clippedBrief}${suffix}`;

  return assembled.slice(0, SUNO_LYRICS_PROMPT_MAX_LENGTH);
}

/** @deprecated Prefer buildStructureRequirement. */
export function buildDurationAwareLyricsGenerationSuffix(durationSec: number): string {
  return `\n${buildStructureRequirement(durationSec)}`;
}

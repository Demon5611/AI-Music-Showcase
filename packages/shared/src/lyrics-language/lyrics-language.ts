import { z } from "zod";

/**
 * Public API / UI allowlist for lyrics generation.
 * Wider than voice validate enum — language is injected into `/lyrics` prompt, not a Suno `language` field.
 * @see docs/language-contracts.md
 * `multi` is resolve-only — never accept from clients.
 */
export const LYRICS_LANGUAGE_VALUES = [
  "auto",
  "en",
  "ka",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "pl",
  "tr",
  "uk",
  "ru",
  "ja",
  "ko",
  "zh",
] as const;

export type LyricsLanguage = (typeof LYRICS_LANGUAGE_VALUES)[number];

export type ResolvedLyricsLanguageCode = Exclude<LyricsLanguage, "auto"> | "multi";

export const lyricsLanguageSchema = z.enum(LYRICS_LANGUAGE_VALUES);

export const LYRICS_LANGUAGE_ENGLISH_NAMES: Record<ResolvedLyricsLanguageCode, string> = {
  en: "English",
  ka: "Georgian",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  pl: "Polish",
  tr: "Turkish",
  uk: "Ukrainian",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  multi: "multilingual as requested",
};

export type LyricsLanguageSource =
  | "explicit_selection"
  | "explicit_prompt_instruction"
  | "custom_lyrics"
  | "prompt_detection"
  | "ui_locale_fallback"
  | "default_fallback";

export type ResolvedLyricsLanguage = {
  code: ResolvedLyricsLanguageCode;
  englishName: string;
  source: LyricsLanguageSource;
  confidence?: number;
};

export function isLyricsLanguage(value: unknown): value is LyricsLanguage {
  return (
    typeof value === "string" &&
    (LYRICS_LANGUAGE_VALUES as readonly string[]).includes(value)
  );
}

export function normalizeLyricsLanguage(value: unknown): LyricsLanguage {
  if (isLyricsLanguage(value)) {
    return value;
  }

  return "auto";
}

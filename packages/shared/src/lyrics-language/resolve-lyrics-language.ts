import {
  detectExplicitLanguageInstruction,
  detectPrimaryLanguage,
  mapUiLocaleToLanguageCode,
} from "./detect-lyrics-language.js";
import {
  LYRICS_LANGUAGE_ENGLISH_NAMES,
  type LyricsLanguage,
  type ResolvedLyricsLanguage,
  type ResolvedLyricsLanguageCode,
} from "./lyrics-language.js";

export type ResolveLyricsLanguageInput = {
  selectedLanguage: LyricsLanguage;
  prompt: string;
  customLyrics?: string | null;
  uiLocale?: string | null;
};

export function resolveLyricsLanguage(
  input: ResolveLyricsLanguageInput,
): ResolvedLyricsLanguage {
  if (input.selectedLanguage !== "auto") {
    return toResolved(input.selectedLanguage, "explicit_selection", 1);
  }

  const promptInstruction = detectExplicitLanguageInstruction(input.prompt);
  if (promptInstruction) {
    return toResolved(promptInstruction, "explicit_prompt_instruction", 0.95);
  }

  const customLyrics = input.customLyrics?.trim();
  if (customLyrics) {
    const customDetected = detectPrimaryLanguage(customLyrics);
    if (customDetected) {
      return toResolved(customDetected.code, "custom_lyrics", customDetected.confidence);
    }
  }

  const promptDetected = detectPrimaryLanguage(input.prompt);
  if (promptDetected) {
    return toResolved(promptDetected.code, "prompt_detection", promptDetected.confidence);
  }

  const fromLocale = mapUiLocaleToLanguageCode(input.uiLocale);
  if (fromLocale) {
    return toResolved(fromLocale, "ui_locale_fallback", 0.4);
  }

  return toResolved("en", "default_fallback", 0.2);
}

function toResolved(
  code: ResolvedLyricsLanguageCode,
  source: ResolvedLyricsLanguage["source"],
  confidence: number,
): ResolvedLyricsLanguage {
  return {
    code,
    englishName: LYRICS_LANGUAGE_ENGLISH_NAMES[code],
    source,
    confidence,
  };
}

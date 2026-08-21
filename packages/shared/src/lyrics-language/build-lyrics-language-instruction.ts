import type { ResolvedLyricsLanguage } from "./lyrics-language.js";

/**
 * Ultra-compact language line for Suno `/lyrics` (hard 200-char prompt limit).
 * English names only — stable provider instruction, not UI locale.
 */
export function buildLyricsLanguageInstruction(resolved: ResolvedLyricsLanguage): string {
  if (resolved.code === "multi") {
    return "Follow the user's bilingual/multilingual lyrics request.";
  }

  return `Generate all lyrics in ${resolved.englishName}. Do not switch language.`;
}

import type { VocalGender } from "../constants/vocal-gender.js";
import type { ResolvedLyricsLanguageCode } from "./lyrics-language.js";

/**
 * Compact first-person grammar samples for lyrics gender hints.
 * Kept short for Suno `/lyrics` 200-char budget.
 */
const GENDER_GRAMMAR_EXAMPLES: Record<
  Exclude<ResolvedLyricsLanguageCode, "multi">,
  Record<VocalGender, string>
> = {
  ru: { f: "я пошла, я была", m: "я пошёл, я был" },
  uk: { f: "я пішла, я була", m: "я пішов, я був" },
  en: { f: "I went, I was", m: "I went, I was" },
  zh: { f: "我走了，我爱过", m: "我走了，我爱过" },
  es: { f: "fui, estaba", m: "fui, estaba" },
  fr: { f: "je suis allée, j'étais", m: "je suis allé, j'étais" },
  de: { f: "ich ging, ich war", m: "ich ging, ich war" },
  it: { f: "sono andata, ero", m: "sono andato, ero" },
  pt: { f: "fui, estava", m: "fui, estava" },
  pl: { f: "poszłam, byłam", m: "poszedłem, byłem" },
  tr: { f: "gittim, oldum", m: "gittim, oldum" },
  ka: { f: "წავედი, ვიყავი", m: "წავედი, ვიყავი" },
  ja: { f: "行った、いた", m: "行った、いた" },
  ko: { f: "갔어, 였어", m: "갔어, 였어" },
};

export function resolveGenderGrammarExamples(
  vocalGender: VocalGender,
  languageCode: ResolvedLyricsLanguageCode | null | undefined,
): string {
  if (!languageCode || languageCode === "multi") {
    return GENDER_GRAMMAR_EXAMPLES.en[vocalGender];
  }

  return GENDER_GRAMMAR_EXAMPLES[languageCode][vocalGender];
}

export function buildNarratorGenderLine(
  vocalGender: VocalGender,
  languageCode: ResolvedLyricsLanguageCode | null | undefined,
): string {
  const examples = resolveGenderGrammarExamples(vocalGender, languageCode);
  return `1st person (${examples}).`;
}

/** Longest gender line for a given gender — safe Auto brief budget. */
export function resolveMaxGenderNarratorLength(vocalGender: VocalGender): number {
  let max = 0;

  for (const code of Object.keys(GENDER_GRAMMAR_EXAMPLES) as Array<
    Exclude<ResolvedLyricsLanguageCode, "multi">
  >) {
    const line = buildNarratorGenderLine(vocalGender, code);
    if (line.length > max) {
      max = line.length;
    }
  }

  return max;
}

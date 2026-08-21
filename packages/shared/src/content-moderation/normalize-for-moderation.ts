const ZERO_WIDTH_REGEX = /[\u200B-\u200D\u2060\uFEFF]/g;
const REPEATED_CHAR_REGEX = /(\p{L}|\d)\1{2,}/gu;
const BETWEEN_LETTERS_REGEX = /(?<=\p{L})[\s\p{P}\p{S}_]+(?=\p{L})/gu;
const MULTISPACE_REGEX = /\s+/g;

const LEET_REPLACEMENTS: Record<string, string> = {
  "@": "a",
  "4": "a",
  "3": "e",
  "1": "i",
  "!": "i",
  "0": "o",
  "$": "s",
  "5": "s",
  "7": "t",
  "+": "t",
};

const TRANSLIT_HINTS: Array<[RegExp, string]> = [
  [/xyi/g, "хуй"],
  [/xuy/g, "хуй"],
  [/xui/g, "хуй"],
  [/hui/g, "хуй"],
  [/pizd/g, "пизд"],
  [/blya/g, "бля"],
  [/ebat/g, "ебат"],
];

function mapLeetspeak(value: string): string {
  return value.replace(/./g, (char) => LEET_REPLACEMENTS[char] ?? char);
}

function collapseRepeatedChars(value: string): string {
  return value.replace(REPEATED_CHAR_REGEX, (_match, char: string) => char);
}

function applyTranslitHints(value: string): string {
  return TRANSLIT_HINTS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    value,
  );
}

export function normalizeForModeration(text: string): string {
  if (!text) {
    return "";
  }

  const lowered = text.toLowerCase().replaceAll("ё", "е");
  const noZeroWidth = lowered.replace(ZERO_WIDTH_REGEX, "");
  const withMappedLeet = mapLeetspeak(noZeroWidth);
  const withTranslitHints = applyTranslitHints(withMappedLeet);
  const collapsedRepeats = collapseRepeatedChars(withTranslitHints);
  const compactBetweenLetters = collapsedRepeats.replace(BETWEEN_LETTERS_REGEX, "");
  const compactSpaces = compactBetweenLetters.replace(MULTISPACE_REGEX, " ").trim();

  return compactSpaces;
}

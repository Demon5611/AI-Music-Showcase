import {
  CONTENT_BLOCKLIST_V1,
  type ContentModerationCategory,
  type ContentBlocklistEntry,
} from "./blocklist.v1.js";
import { normalizeForModeration } from "./normalize-for-moderation.js";
import { CONTENT_MODERATION_PATTERNS } from "./patterns.js";

export { type ContentModerationCategory };

export const CONTENT_MODERATION_ERROR_RU =
  "Текст содержит недопустимый контент. Измените формулировку и попробуйте снова.";

export type ContentModerationResult =
  | { allowed: true }
  | {
      allowed: false;
      category: ContentModerationCategory;
      reasonMessageRu: string;
    };

const LATIN_TO_CYRILLIC_MAP: Record<string, string> = {
  a: "а",
  b: "б",
  c: "с",
  e: "е",
  h: "х",
  i: "и",
  k: "к",
  m: "м",
  o: "о",
  p: "р",
  t: "т",
  x: "х",
  y: "у",
};

function transliterateLatinToCyrillic(value: string): string {
  return value.replace(/[a-z]/g, (char) => LATIN_TO_CYRILLIC_MAP[char] ?? char);
}

function buildCandidates(input: string): string[] {
  const normalized = normalizeForModeration(input);
  const compact = normalized.replace(/[\s\p{P}\p{S}_]+/gu, "");
  const compactCyr = transliterateLatinToCyrillic(compact);
  const normalizedCyr = transliterateLatinToCyrillic(normalized);

  return [normalized, compact, normalizedCyr, compactCyr];
}

function hasPatternMatch(rawText: string, normalizedText: string): ContentModerationCategory | null {
  for (const { category, regex } of CONTENT_MODERATION_PATTERNS) {
    regex.lastIndex = 0;
    if (regex.test(rawText)) {
      return category;
    }

    regex.lastIndex = 0;
    if (regex.test(normalizedText)) {
      return category;
    }
  }

  return null;
}

function isBlockedByToken(entry: ContentBlocklistEntry, candidates: string[]): boolean {
  if (entry.token.length < 3) {
    return false;
  }

  if (/^[a-z]+$/.test(entry.token)) {
    const tokenRegex = new RegExp(`(?:^|[^a-z])${entry.token}[a-z]*`, "u");
    return candidates.some((candidate) => tokenRegex.test(candidate));
  }

  return candidates.some((candidate) => candidate.includes(entry.token));
}

function findBlockedCategory(input: string): ContentModerationCategory | null {
  const normalized = normalizeForModeration(input);
  const patternCategory = hasPatternMatch(input.toLowerCase(), normalized);

  if (patternCategory) {
    return patternCategory;
  }

  const candidates = buildCandidates(input);

  for (const entry of CONTENT_BLOCKLIST_V1) {
    if (isBlockedByToken(entry, candidates)) {
      return entry.category;
    }
  }

  return null;
}

export function checkContentAllowed(text: string): ContentModerationResult {
  if (!text.trim()) {
    return { allowed: true };
  }

  const category = findBlockedCategory(text);
  if (!category) {
    return { allowed: true };
  }

  return {
    allowed: false,
    category,
    reasonMessageRu: CONTENT_MODERATION_ERROR_RU,
  };
}

export function assertContentAllowed(text: string): void {
  const result = checkContentAllowed(text);
  if (!result.allowed) {
    throw new Error(result.reasonMessageRu);
  }
}

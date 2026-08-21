import type { ResolvedLyricsLanguageCode } from "./lyrics-language.js";

const MIN_DETECT_CHARS = 8;
const SHORT_AMBIGUOUS_MAX = 24;

const EXPLICIT_LANGUAGE_PATTERNS: Array<{
  code: ResolvedLyricsLanguageCode;
  pattern: RegExp;
}> = [
  {
    code: "multi",
    pattern:
      /\b(bilingual|multilingual|dua\s*lingua|двуязычн|на\s+двух\s+языках|english\s+and\s+spanish|spanish\s+and\s+english)\b/i,
  },
  // Language-specific patterns first (before English catch-all).
  {
    code: "ka",
    pattern:
      /\b(in\s+georgian|georgian\s+lyrics|sing\s+in\s+georgian|lyrics?\s+(must\s+be|should\s+be|in)\s+georgian|на\s+грузинском|ქართულ)/i,
  },
  {
    code: "es",
    pattern:
      /\b(in\s+spanish|spanish\s+lyrics|sing\s+in\s+spanish|lyrics?\s+(must\s+be|should\s+be|in)\s+spanish|en\s+español|на\s+испанском|испанск)/i,
  },
  {
    code: "fr",
    pattern:
      /\b(in\s+french|french\s+lyrics|sing\s+in\s+french|lyrics?\s+(must\s+be|should\s+be|in)\s+french|en\s+français|на\s+французском|французск)/i,
  },
  {
    code: "de",
    pattern:
      /\b(in\s+german|german\s+lyrics|sing\s+in\s+german|lyrics?\s+(must\s+be|should\s+be|in)\s+german|auf\s+deutsch|на\s+немецком|немецк)/i,
  },
  {
    code: "it",
    pattern:
      /\b(in\s+italian|italian\s+lyrics|sing\s+in\s+italian|lyrics?\s+(must\s+be|should\s+be|in)\s+italian|in\s+italiano|на\s+итальянском|итальянск)/i,
  },
  {
    code: "pt",
    pattern:
      /\b(in\s+portuguese|portuguese\s+lyrics|lyrics?\s+(must\s+be|should\s+be|in)\s+portuguese|em\s+português|на\s+португальском|португальск)/i,
  },
  {
    code: "pl",
    pattern:
      /\b(in\s+polish|polish\s+lyrics|lyrics?\s+(must\s+be|should\s+be|in)\s+polish|po\s+polsku|на\s+польском|польск)/i,
  },
  {
    code: "tr",
    pattern:
      /\b(in\s+turkish|turkish\s+lyrics|lyrics?\s+(must\s+be|should\s+be|in)\s+turkish|türkçe|на\s+турецком|турецк)/i,
  },
  {
    code: "uk",
    pattern:
      /\b(in\s+ukrainian|ukrainian\s+lyrics|lyrics?\s+(must\s+be|should\s+be|in)\s+ukrainian|українськ|на\s+украинском|украинск)/i,
  },
  {
    code: "ru",
    pattern:
      /\b(in\s+russian|russian\s+lyrics|lyrics?\s+(must\s+be|should\s+be|in)\s+russian|на\s+русском|русск(ий|ом|ая)|напиши\s+песню\s+на\s+рус)/i,
  },
  {
    code: "ja",
    pattern:
      /\b(in\s+japanese|japanese\s+lyrics|lyrics?\s+(must\s+be|should\s+be|in)\s+japanese|на\s+японском|日本語)/i,
  },
  {
    code: "ko",
    pattern:
      /\b(in\s+korean|korean\s+lyrics|lyrics?\s+(must\s+be|should\s+be|in)\s+korean|на\s+корейском|한국어)/i,
  },
  {
    code: "zh",
    pattern:
      /\b(in\s+chinese|chinese\s+lyrics|lyrics?\s+(must\s+be|should\s+be|in)\s+chinese|на\s+китайском|中文|汉语)/i,
  },
  {
    code: "en",
    pattern:
      /\b(in\s+english|english\s+lyrics|sing\s+in\s+english|lyrics?\s+(must\s+be|should\s+be|in)\s+english|write\s+(the\s+)?lyrics?\s+in\s+english|на\s+английском|английск)/i,
  },
];

const LATIN_STOPWORDS: Record<Exclude<ResolvedLyricsLanguageCode, "multi">, string[]> = {
  en: ["the", "and", "about", "song", "with", "from", "that", "this", "love", "night"],
  es: ["una", "canción", "sobre", "para", "como", "amor", "verano", "noche", "con", "los"],
  fr: ["une", "chanson", "sur", "pour", "avec", "amour", "nuit", "dans", "les", "des"],
  de: ["ein", "lied", "über", "und", "mit", "liebe", "nacht", "das", "der", "die"],
  it: ["una", "canzone", "sulla", "per", "con", "amore", "notte", "della", "che", "sono"],
  pt: ["uma", "canção", "sobre", "para", "com", "amor", "noite", "dos", "que", "uma"],
  pl: ["piosanka", "piosenka", "o", "miłość", "noc", "jest", "nie", "się", "jak", "dla"],
  tr: ["bir", "şarkı", "hakkında", "için", "ile", "aşk", "gece", "ve", "bu", "bir"],
  ka: [],
  uk: [],
  ru: [],
  ja: [],
  ko: [],
  zh: [],
};

const UI_LOCALE_TO_CODE: Record<string, ResolvedLyricsLanguageCode> = {
  en: "en",
  ru: "ru",
  uk: "uk",
  ka: "ka",
  es: "es",
  fr: "fr",
  de: "de",
  it: "it",
  pt: "pt",
  pl: "pl",
  tr: "tr",
  ja: "ja",
  ko: "ko",
  zh: "zh",
};

export function detectExplicitLanguageInstruction(
  text: string,
): ResolvedLyricsLanguageCode | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  for (const entry of EXPLICIT_LANGUAGE_PATTERNS) {
    if (entry.pattern.test(trimmed)) {
      return entry.code;
    }
  }

  return null;
}

export function detectPrimaryLanguage(
  text: string,
): { code: ResolvedLyricsLanguageCode; confidence: number } | null {
  const trimmed = text.trim();
  if (trimmed.length < MIN_DETECT_CHARS) {
    return null;
  }

  if (isShortAmbiguous(trimmed)) {
    return null;
  }

  const scriptHit = detectByScript(trimmed);
  if (scriptHit) {
    return scriptHit;
  }

  return detectLatinByStopwords(trimmed);
}

export function mapUiLocaleToLanguageCode(
  uiLocale: string | null | undefined,
): ResolvedLyricsLanguageCode | null {
  if (!uiLocale) {
    return null;
  }

  const base = uiLocale.trim().toLowerCase().split("-")[0];
  if (!base) {
    return null;
  }

  return UI_LOCALE_TO_CODE[base] ?? null;
}

function isShortAmbiguous(text: string): boolean {
  if (text.length > SHORT_AMBIGUOUS_MAX) {
    return false;
  }

  const letters = text.replace(/[^a-zA-Z\u0400-\u04FF\u10A0-\u10FF]/g, "");
  if (letters.length < MIN_DETECT_CHARS) {
    return true;
  }

  // Genre-only / production tags without a clear natural-language sentence.
  return /^(edm|pop|rock|rap|trap|lofi|lo-fi|jazz|techno|house|r&b|hip[\s-]?hop|summer|track|song)(\s+(song|track|beat|vibes?))?$/i.test(
    text.trim(),
  );
}

function detectByScript(
  text: string,
): { code: ResolvedLyricsLanguageCode; confidence: number } | null {
  const georgian = countMatches(text, /[\u10A0-\u10FF]/g);
  const cyrillic = countMatches(text, /[\u0400-\u04FF]/g);
  const hangul = countMatches(text, /[\uAC00-\uD7AF]/g);
  const kana = countMatches(text, /[\u3040-\u30FF]/g);
  const cjk = countMatches(text, /[\u4E00-\u9FFF]/g);
  const latin = countMatches(text, /[A-Za-z]/g);
  const total = georgian + cyrillic + hangul + kana + cjk + latin;

  if (total < MIN_DETECT_CHARS) {
    return null;
  }

  if (georgian / total >= 0.4) {
    return { code: "ka", confidence: 0.95 };
  }

  if (hangul / total >= 0.4) {
    return { code: "ko", confidence: 0.9 };
  }

  if (kana / total >= 0.25 || (kana + cjk) / total >= 0.45) {
    return { code: "ja", confidence: 0.85 };
  }

  if (cjk / total >= 0.4) {
    return { code: "zh", confidence: 0.85 };
  }

  if (cyrillic / total >= 0.4) {
    return detectCyrillicLanguage(text);
  }

  return null;
}

function detectCyrillicLanguage(
  text: string,
): { code: ResolvedLyricsLanguageCode; confidence: number } {
  if (/[іїєґІЇЄҐ]/.test(text)) {
    return { code: "uk", confidence: 0.85 };
  }

  return { code: "ru", confidence: 0.8 };
}

function detectLatinByStopwords(
  text: string,
): { code: ResolvedLyricsLanguageCode; confidence: number } | null {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-zà-öø-ÿąćęłńóśźżäöüßşçı\s'-]/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);

  if (tokens.length < 3) {
    return null;
  }

  let bestCode: ResolvedLyricsLanguageCode | null = null;
  let bestScore = 0;

  for (const [code, words] of Object.entries(LATIN_STOPWORDS) as Array<
    [ResolvedLyricsLanguageCode, string[]]
  >) {
    if (words.length === 0) {
      continue;
    }

    let score = 0;
    for (const token of tokens) {
      if (words.includes(token)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCode = code;
    }
  }

  if (!bestCode || bestScore < 2) {
    return null;
  }

  return {
    code: bestCode,
    confidence: Math.min(0.9, 0.45 + bestScore * 0.1),
  };
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

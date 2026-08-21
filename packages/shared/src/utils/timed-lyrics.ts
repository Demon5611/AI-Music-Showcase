import type {
  TimedLyricsDisplayLine,
  TimedLyricsLine,
  TimedLyricsPayload,
  TimedLyricsWord,
} from "../types/timed-lyrics.js";

export interface AlignedLyricsWord {
  word: string;
  startS: number;
  endS: number;
}

const SECTION_MARKER_PATTERN = /^\[[^\]]+\]$/;
const INLINE_SECTION_PATTERN = /(\[[^\]]+\])/g;

export function isTimedLyricsSectionMarker(text: string): boolean {
  return SECTION_MARKER_PATTERN.test(text.trim());
}

export function splitWordText(text: string): string[] {
  const result: string[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const tokens = line
      .split(INLINE_SECTION_PATTERN)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);

    result.push(...tokens);
  }

  return result;
}

function normalizeTimedWordsForDisplay(words: TimedLyricsWord[]): TimedLyricsWord[] {
  const result: TimedLyricsWord[] = [];

  for (const word of words) {
    for (const part of splitWordText(word.text)) {
      result.push({
        text: part,
        startSec: word.startSec,
        endSec: word.endSec,
      });
    }
  }

  return result;
}

export function mapAlignedWordsToTimedWords(words: AlignedLyricsWord[]): TimedLyricsWord[] {
  const result: TimedLyricsWord[] = [];

  for (const item of words) {
    for (const part of splitWordText(item.word)) {
      result.push({
        text: part,
        startSec: item.startS,
        endSec: item.endS,
      });
    }
  }

  return result;
}

export function groupAlignedWordsToLines(words: AlignedLyricsWord[]): TimedLyricsLine[] {
  return groupWordsToDisplayLines(mapAlignedWordsToTimedWords(words)).map((line) => ({
    startSec: line.startSec,
    endSec: line.endSec,
    text: line.words.map((word) => word.text).join(" "),
  }));
}

export function groupWordsToDisplayLines(words: TimedLyricsWord[]): TimedLyricsDisplayLine[] {
  const normalizedWords = normalizeTimedWordsForDisplay(words);
  const lines: TimedLyricsDisplayLine[] = [];
  let currentWords: TimedLyricsWord[] = [];
  let lineStart = 0;
  let lineEnd = 0;

  const flush = () => {
    if (currentWords.length === 0) {
      return;
    }

    lines.push({
      startSec: lineStart,
      endSec: lineEnd,
      words: currentWords,
    });
    currentWords = [];
  };

  const pushSectionLine = (item: TimedLyricsWord) => {
    flush();
    lines.push({
      startSec: item.startSec,
      endSec: item.endSec,
      words: [item],
    });
  };

  for (const item of normalizedWords) {
    if (isTimedLyricsSectionMarker(item.text)) {
      pushSectionLine(item);
      continue;
    }

    if (currentWords.length === 0) {
      lineStart = item.startSec;
    }

    currentWords.push(item);
    lineEnd = item.endSec;
  }

  flush();

  return lines;
}

export function expandTimedLyricsLines(lines: TimedLyricsLine[]): TimedLyricsLine[] {
  const expanded: TimedLyricsLine[] = [];

  for (const line of lines) {
    const parts = splitWordText(line.text);

    if (parts.length <= 1) {
      expanded.push(line);
      continue;
    }

    for (const text of parts) {
      expanded.push({
        startSec: line.startSec,
        endSec: line.endSec,
        text,
      });
    }
  }

  return expanded;
}

function parseTimedLyricsLine(item: unknown): TimedLyricsLine | null {
  if (
    typeof item !== "object" ||
    item === null ||
    typeof (item as TimedLyricsLine).startSec !== "number" ||
    typeof (item as TimedLyricsLine).endSec !== "number" ||
    typeof (item as TimedLyricsLine).text !== "string"
  ) {
    return null;
  }

  return {
    startSec: (item as TimedLyricsLine).startSec,
    endSec: (item as TimedLyricsLine).endSec,
    text: (item as TimedLyricsLine).text,
  };
}

function parseTimedLyricsWord(item: unknown): TimedLyricsWord | null {
  if (
    typeof item !== "object" ||
    item === null ||
    typeof (item as TimedLyricsWord).startSec !== "number" ||
    typeof (item as TimedLyricsWord).endSec !== "number" ||
    typeof (item as TimedLyricsWord).text !== "string"
  ) {
    return null;
  }

  return {
    startSec: (item as TimedLyricsWord).startSec,
    endSec: (item as TimedLyricsWord).endSec,
    text: (item as TimedLyricsWord).text,
  };
}

function parseTimedLyricsLinesArray(value: unknown[]): TimedLyricsLine[] | null {
  const lines: TimedLyricsLine[] = [];

  for (const item of value) {
    const line = parseTimedLyricsLine(item);

    if (!line) {
      return null;
    }

    lines.push(line);
  }

  return lines;
}

/** @deprecated Use parseTimedLyricsCache */
export function parseTimedLyricsJson(value: unknown): TimedLyricsLine[] | null {
  return parseTimedLyricsCache(value)?.lines ?? null;
}

export function parseTimedLyricsCache(value: unknown): TimedLyricsPayload | null {
  if (Array.isArray(value)) {
    const lines = parseTimedLyricsLinesArray(value);

    if (!lines) {
      return null;
    }

    return { lines };
  }

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as { lines?: unknown; words?: unknown };
  const lines = Array.isArray(record.lines) ? parseTimedLyricsLinesArray(record.lines) : null;

  if (!lines) {
    return null;
  }

  const words = Array.isArray(record.words)
    ? record.words
        .map((item) => parseTimedLyricsWord(item))
        .filter((item): item is TimedLyricsWord => item !== null)
    : undefined;

  return {
    lines,
    words: words && words.length > 0 ? words : undefined,
  };
}

export function serializeTimedLyricsCache(payload: TimedLyricsPayload): {
  v: 2;
  lines: TimedLyricsLine[];
  words: TimedLyricsWord[];
} {
  return {
    v: 2,
    lines: payload.lines,
    words: payload.words ?? [],
  };
}

export function resolveTimedWordState(
  word: TimedLyricsWord,
  currentTimeSec: number,
): "past" | "active" | "upcoming" {
  if (currentTimeSec >= word.endSec) {
    return "past";
  }

  if (currentTimeSec >= word.startSec) {
    return "active";
  }

  return "upcoming";
}

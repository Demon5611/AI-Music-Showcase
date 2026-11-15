import { groupAlignedWordsToLines, mapAlignedWordsToTimedWords } from "@ai-music/shared";
import type { TimestampedLyricsResult } from "../../domain/music.types.js";
import type { LegacyengineTimestampedLyricsDataRaw } from "./legacyengine-api.types.js";

export function mapLegacyengineTimestampedLyricsData(
  data: LegacyengineTimestampedLyricsDataRaw,
): TimestampedLyricsResult {
  const alignedWords = (data.alignedWords ?? [])
    .filter((item) => item.word.trim().length > 0)
    .map((item) => ({
      word: item.word,
      startS: item.startS,
      endS: item.endS,
    }));

  const words = mapAlignedWordsToTimedWords(alignedWords);

  return {
    lines: groupAlignedWordsToLines(alignedWords),
    words,
  };
}

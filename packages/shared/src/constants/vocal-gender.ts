import type { VoiceLanguage } from "../voice-language/voice-language.js";

export type VocalGender = "m" | "f";

/** Legacy short labels — prefer UI i18n (`MusicCreate.gender`) for user-facing copy. */
export const VOCAL_GENDER_LABELS: Record<VocalGender, string> = {
  m: "Male",
  f: "Female",
};

/** Hard limit enforced by Suno `/lyrics` (`MUSIC_INVALID_PROMPT` above 200). */
export const SUNO_LYRICS_PROMPT_MAX_LENGTH = 200;

export function isVocalGender(value: unknown): value is VocalGender {
  return value === "m" || value === "f";
}

/**
 * Compact gender hint without language context (English samples).
 * Lyrics flow uses buildNarratorGenderRequirement(languageCode) instead.
 */
export function buildGenderLyricsPromptSuffix(_vocalGender: VocalGender): string {
  void _vocalGender;
  return `\n1st person (I went, I was).`;
}

export function buildGenderAwareLyricsPrompt(
  prompt: string,
  vocalGender: VocalGender | null | undefined,
): string {
  const trimmedPrompt = prompt.trim();

  if (!vocalGender) {
    return trimmedPrompt;
  }

  return `${trimmedPrompt}${buildGenderLyricsPromptSuffix(vocalGender)}`;
}

/**
 * @deprecated Unused in music generate path. Kept for compatibility; English-only, no RU bias.
 */
export function buildGenderAwareMusicPrompt(
  prompt: string,
  vocalGender: VocalGender | null | undefined,
): string {
  const trimmedPrompt = prompt.trim();

  if (!vocalGender || !trimmedPrompt) {
    return trimmedPrompt;
  }

  const narrator = vocalGender === "f" ? "female" : "male";

  return `[first-person, ${narrator} narrator grammar]\n\n${trimmedPrompt}`;
}

export function stripPersonaConflictingStyleTags(style: string | undefined): string | undefined {
  const trimmedStyle = style?.trim();

  if (!trimmedStyle) {
    return trimmedStyle;
  }

  const filtered = trimmedStyle
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/\bvocal\b/i.test(part));

  return filtered.length > 0 ? filtered.join(", ") : trimmedStyle;
}

/** Brief for optional home-page recording script (language-specific). */
export const VOICE_RECORDING_SCRIPT_GENERATION_PROMPTS: Record<VoiceLanguage, string> =
  {
    en: "Short ~15 sec sung lyric about music.",
    ru: "Короткий текст ~15 сек для напева про музыку.",
    zh: "一段约15秒、关于音乐的短歌词，适合哼唱。",
    es: "Letra corta de ~15 s para cantar sobre la música.",
    fr: "Courtes paroles ~15 s à chanter sur la musique.",
    pt: "Letra curta de ~15 s para cantar sobre música.",
    de: "Kurzer gesungener Text ~15 Sek. über Musik.",
    ja: "音楽についての約15秒の短い歌唱用歌詞。",
    ko: "음악에 대한 약 15초 분량의 짧은 노래 가사.",
    hi: "संगीत के बारे में ~15 सेकंड का छोटा गाने योग्य बोल।",
  };

/** @deprecated Prefer buildVoiceRecordingScriptPrompt(language). */
export const VOICE_RECORDING_SCRIPT_GENERATION_PROMPT =
  VOICE_RECORDING_SCRIPT_GENERATION_PROMPTS.ru;

export const VOICE_RECORDING_SCRIPT_DURATION_SEC = 15;

export function buildVoiceRecordingScriptPrompt(
  language: VoiceLanguage = "ru",
): string {
  return VOICE_RECORDING_SCRIPT_GENERATION_PROMPTS[language];
}

/** Suno Voice `/voice/generate` metadata — gender for persona clone. */
export function buildSunoVoiceCloneStyle(vocalGender: VocalGender): string {
  return vocalGender === "f" ? "Female Vocal" : "Male Vocal";
}

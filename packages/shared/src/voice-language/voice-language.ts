import { z } from "zod";

/**
 * Full Suno `/voice/validate` language allowlist.
 * Not the same as lyrics UI languages — see docs/language-contracts.md.
 * @see https://docs.sunoapi.org/suno-api/suno-voice-validate
 */
export const VOICE_LANGUAGE_VALUES = [
  "en",
  "ru",
  "zh",
  "es",
  "fr",
  "pt",
  "de",
  "ja",
  "ko",
  "hi",
] as const;

export type VoiceLanguage = (typeof VOICE_LANGUAGE_VALUES)[number];

export const voiceLanguageSchema = z.enum(VOICE_LANGUAGE_VALUES);

export const DEFAULT_VOICE_LANGUAGE: VoiceLanguage = "en";

/** Machine consent phrases — must match upload validation exactly. */
export const VOICE_CONSENT_PHRASES: Record<VoiceLanguage, string> = {
  en: "I confirm that I am using my own voice to create a music track.",
  ru: "Я подтверждаю, что использую свой голос для создания музыкального трека.",
  zh: "我确认使用自己的声音创作音乐作品。",
  es: "Confirmo que estoy usando mi propia voz para crear una pista musical.",
  fr: "Je confirme que j'utilise ma propre voix pour créer une piste musicale.",
  pt: "Confirmo que estou usando minha própria voz para criar uma faixa musical.",
  de: "Ich bestätige, dass ich meine eigene Stimme verwende, um einen Musiktrack zu erstellen.",
  ja: "音楽トラックの作成に自分の声を使用することを確認します。",
  ko: "음악 트랙 제작에 제 자신의 목소리를 사용함을 확인합니다.",
  hi: "मैं पुष्टि करता हूँ कि संगीत ट्रैक बनाने के लिए मैं अपनी आवाज़ का उपयोग कर रहा हूँ।",
};

/** @deprecated Prefer getVoiceConsentPhrase(language). Kept as Russian default for legacy imports. */
export const VOICE_CONSENT_PHRASE = VOICE_CONSENT_PHRASES.ru;

export function isVoiceLanguage(value: unknown): value is VoiceLanguage {
  return (
    typeof value === "string" &&
    (VOICE_LANGUAGE_VALUES as readonly string[]).includes(value)
  );
}

export function normalizeVoiceLanguage(value: unknown): VoiceLanguage {
  if (isVoiceLanguage(value)) {
    return value;
  }

  return DEFAULT_VOICE_LANGUAGE;
}

export function getVoiceConsentPhrase(language: VoiceLanguage): string {
  return VOICE_CONSENT_PHRASES[language];
}

export function isVoiceConsentPhraseForLanguage(
  phrase: string,
  language: VoiceLanguage,
): boolean {
  return phrase === VOICE_CONSENT_PHRASES[language];
}

/** Map next-intl / UI locale → voice language when possible. */
export function resolveVoiceLanguageFromUiLocale(locale: string): VoiceLanguage {
  const base = locale.trim().toLowerCase().split("-")[0] ?? "";

  if (isVoiceLanguage(base)) {
    return base;
  }

  return DEFAULT_VOICE_LANGUAGE;
}

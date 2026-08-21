export const MUSIC_STYLES = [
  { id: "pop", label: "Pop" },
  { id: "rock", label: "Rock" },
  { id: "hip-hop", label: "Hip-Hop" },
  { id: "electronic", label: "Electronic" },
  { id: "r-and-b", label: "R&B" },
  { id: "acoustic", label: "Acoustic" },
] as const;

export type MusicStyleId = (typeof MUSIC_STYLES)[number]["id"];

export const VOICE_CONVERSION_CREDIT_COST = 5;

/** Онбординг голоса — бесплатно. */
export const VOICE_CLONE_PREPARE_CREDIT_COST = 0;

/** Онбординг голоса — бесплатно. */
export const VOICE_CLONE_VERIFY_CREDIT_COST = 0;

export * from "./credits-economy.js";
export * from "./mureka-credits.js";
export * from "./mureka-economics.js";
export * from "./music-generate-cost.js";
export * from "./lyrics-credits.js";
export * from "./mureka-base-url.js";
export * from "./mureka-flags.js";
export * from "./mureka-availability.js";
export * from "./mureka-worker-heartbeat.js";
export * from "./voice-deletion.js";
export * from "./voice-profile-recovery.js";
export * from "./account-deletion.js";
export * from "./credit-packages.js";
export * from "./pricing-examples.js";
export * from "./tbc-checkout.js";
export * from "./flitt-checkout.js";
export * from "./payment-provider.js";
export * from "./plans.js";
export * from "./music-combo-styles.js";
export * from "./music-duration.js";
export * from "./music-lyrics-limits.js";
export * from "./music-provider-errors.js";
export * from "./voice-presets.js";

export {
  DEFAULT_VOICE_LANGUAGE,
  VOICE_CONSENT_PHRASE,
  VOICE_CONSENT_PHRASES,
  VOICE_LANGUAGE_VALUES,
  getVoiceConsentPhrase,
  isVoiceConsentPhraseForLanguage,
  isVoiceLanguage,
  normalizeVoiceLanguage,
  resolveVoiceLanguageFromUiLocale,
  voiceLanguageSchema,
  type VoiceLanguage,
} from "../voice-language/index.js";

export const MIN_VOICE_SAMPLE_DURATION_SEC = 10;

export const MAX_VOICE_SAMPLE_DURATION_SEC = 120;

/** Рекомендуемая длительность образца на главной — фраза верификации слишком короткая для клона. */
export const RECOMMENDED_VOICE_SAMPLE_DURATION_MIN_SEC = 20;

export const RECOMMENDED_VOICE_SAMPLE_DURATION_MAX_SEC = 30;

/** Минимальная длина записи фразы Suno на /consent. */
export const MIN_VOICE_VERIFY_DURATION_SEC = 5;

/**
 * TTL фразы верификации голоса (с момента её генерации сервисом).
 * После истечения фраза недействительна — нужна новая (restart, а не resume).
 */
export const VOICE_VERIFY_PHRASE_TTL_SEC = 120;

export function isRecommendedVoiceSampleDuration(durationSec: number): boolean {
  return durationSec >= RECOMMENDED_VOICE_SAMPLE_DURATION_MIN_SEC;
}

export function buildRecommendedVoiceSampleDurationLabel(): string {
  return `${RECOMMENDED_VOICE_SAMPLE_DURATION_MIN_SEC}–${RECOMMENDED_VOICE_SAMPLE_DURATION_MAX_SEC} сек`;
}

export function buildVoiceSampleDurationRangeLabel(): string {
  return `${MIN_VOICE_SAMPLE_DURATION_SEC}–${MAX_VOICE_SAMPLE_DURATION_SEC} сек`;
}

export const GENERATION_QUEUE_NAME = "generation";

export * from "./provider-job-queue.js";
export * from "./bullmq-job-id.js";
export * from "./mureka-provider-job-queue.js";
export * from "./music-track-persistence-queue.js";
export * from "./provider-data-deletion-queue.js";
export * from "./refund.js";
export * from "./credit-pack-refund.js";
export * from "./cash-refund.js";
export * from "./vocal-gender.js";

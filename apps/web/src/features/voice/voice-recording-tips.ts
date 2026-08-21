import {
  RECOMMENDED_VOICE_SAMPLE_DURATION_MAX_SEC,
  RECOMMENDED_VOICE_SAMPLE_DURATION_MIN_SEC,
} from "@ai-music/shared";

/** Kits training docs — basis for short reference sample tips. */
export const KITS_RECORDING_DOCS_URL =
  "https://docs.kits.ai/train/high-quality-datasets";

export const KITS_VOICE_CONVERSION_DOCS_URL =
  "https://docs.kits.ai/api-reference/api-endpoints/voice-conversion-api/create-new-voice-conversion-job";

/** Plain numeric range for {duration} interpolation — unit word lives in the translated message. */
export const VOICE_RECORDING_TIP_DURATION_LABEL = `${RECOMMENDED_VOICE_SAMPLE_DURATION_MIN_SEC}–${RECOMMENDED_VOICE_SAMPLE_DURATION_MAX_SEC}`;

/** Keys under VoiceUpload.tips — panel translates with t(`tips.${key}`). */
export const VOICE_RECORDING_TIP_KEYS = [
  "sampleDuration",
  "sameVoiceNext",
  "quietRoom",
  "micDistance",
  "moderateVolume",
  "headphones",
  "avoidReadingOnly",
] as const;

/** Keys under VoiceUpload.verifyTips — panel translates with t(`verifyTips.${key}`). */
export const VOICE_VERIFY_TIP_KEYS = ["sameManner", "matchStyle", "dontCutShort"] as const;

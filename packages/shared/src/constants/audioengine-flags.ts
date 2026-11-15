/**
 * Audioengine staging feature flags — production-safe defaults (all off).
 * Resolved from env; never enable in production without explicit rollout.
 */

import {
  describeAudioengineBaseUrl,
  parseAudioengineBaseUrl,
} from "./audioengine-base-url.js";
import {
  AUDIOENGINE_OUTPUT_COUNT,
} from "./audioengine-economics.js";

export const AUDIOENGINE_SUPPORTED_LYRICS_LANGUAGES = [
  "en",
  "ru",
  "zh",
  "ja",
  "ko",
  "pt",
  "es",
  "de",
  "fr",
  "it",
] as const;

export type AudioengineSupportedLyricsLanguage =
  (typeof AUDIOENGINE_SUPPORTED_LYRICS_LANGUAGES)[number];

export function isAudioengineSupportedLyricsLanguage(
  value: string,
): value is AudioengineSupportedLyricsLanguage {
  return (AUDIOENGINE_SUPPORTED_LYRICS_LANGUAGES as readonly string[]).includes(value);
}

export const AUDIOENGINE_VOCAL_CLONE_MIN_DURATION_SEC = 15;
export const AUDIOENGINE_VOCAL_CLONE_MAX_DURATION_SEC = 30;
export const AUDIOENGINE_VOCAL_CLONE_MAX_BYTES = 10 * 1024 * 1024;

export const VOICE_PROFILE_STATUSES = [
  "creating",
  "ready",
  "failed",
  "deletion_requested",
  "deleted_locally",
  "provider_deletion_pending",
  "provider_deleted",
] as const;

export type VoiceProfileStatus = (typeof VOICE_PROFILE_STATUSES)[number];

export function isVoiceProfileStatus(value: string): value is VoiceProfileStatus {
  return (VOICE_PROFILE_STATUSES as readonly string[]).includes(value);
}

/** Statuses visible in normal user GET /voice-profiles/me. */
export const VOICE_PROFILE_USER_VISIBLE_STATUSES = [
  "creating",
  "ready",
  "failed",
] as const;

/** Statuses that block a new paid create (one active profile MVP). */
export const VOICE_PROFILE_ACTIVE_STATUSES = ["creating", "ready"] as const;

/** Statuses that must never be used for music generation. */
export const VOICE_PROFILE_UNUSABLE_STATUSES = [
  "failed",
  "deletion_requested",
  "deleted_locally",
  "provider_deletion_pending",
  "provider_deleted",
] as const;

export const PROVIDER_DELETION_REQUEST_STATUSES = [
  "pending",
  /** Atomic claim while worker sends deletion email. */
  "submitting",
  /** Email accepted by transactional provider (= product "submitted"). */
  "submitted_to_provider",
  /** Email submit exhausted / non-retryable — ops must intervene; still open. */
  "submit_failed",
  "confirmed",
  "failed",
  /** Ops/recovery cancelled before provider submit — audit retained, not open. */
  "cancelled",
] as const;

export type ProviderDeletionRequestStatus =
  (typeof PROVIDER_DELETION_REQUEST_STATUSES)[number];

export function isProviderDeletionRequestStatus(
  value: string,
): value is ProviderDeletionRequestStatus {
  return (PROVIDER_DELETION_REQUEST_STATUSES as readonly string[]).includes(value);
}

function envFlagTrue(env: NodeJS.ProcessEnv, key: string): boolean {
  return env[key]?.trim() === "true";
}

export interface AudioengineFeatureFlags {
  enabled: boolean;
  personalVoiceEnabled: boolean;
  voiceDeletionEnabled: boolean;
  /**
   * Explicit production rollout gate. Default false.
   * Ignored outside APP_ENV=production (staging/dev use enabled + personalVoice only).
   */
  productionRolloutEnabled: boolean;
  mp3PersistEnabled: boolean;
  wavPersistEnabled: boolean;
  flacPersistEnabled: boolean;
  legacyengineFallbackEnabled: boolean;
  model: string;
  /**
   * Lyrics-to-Song `n` — always {@link AUDIOENGINE_OUTPUT_COUNT} (1).
   * `AUDIOENGINE_SONG_COUNT` env is deprecated and ignored.
   */
  songCount: number;
  workerConcurrency: number;
  providerConcurrency: number;
  vocalCloneConcurrency: number;
  /** Normalized HTTPS base URL when valid; empty string when invalid. */
  baseUrl: string;
  baseUrlConfigured: boolean;
  baseUrlValid: boolean;
  baseUrlProtocol: string | null;
  baseUrlHostname: string | null;
  apiKeyConfigured: boolean;
}

export function resolveAudioengineFeatureFlags(
  env: NodeJS.ProcessEnv = process.env,
): AudioengineFeatureFlags {
  // AUDIOENGINE_SONG_COUNT is deprecated: product invariant is always one output.
  void env.AUDIOENGINE_SONG_COUNT;
  const workerConcurrency = Number(env.AUDIOENGINE_WORKER_CONCURRENCY ?? 1);
  const providerConcurrency = Number(env.AUDIOENGINE_PROVIDER_CONCURRENCY ?? 1);
  const vocalCloneConcurrency = Number(env.AUDIOENGINE_VOCAL_CLONE_CONCURRENCY ?? 1);
  const baseUrlRaw = env.AUDIOENGINE_BASE_URL;
  const baseUrlMeta = describeAudioengineBaseUrl(baseUrlRaw);
  const parsedBaseUrl = parseAudioengineBaseUrl(baseUrlRaw);

  return {
    enabled: envFlagTrue(env, "AUDIOENGINE_ENABLED"),
    personalVoiceEnabled: envFlagTrue(env, "AUDIOENGINE_PERSONAL_VOICE_ENABLED"),
    voiceDeletionEnabled: envFlagTrue(env, "AUDIOENGINE_VOICE_DELETION_ENABLED"),
    productionRolloutEnabled: envFlagTrue(env, "AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED"),
    mp3PersistEnabled: env.AUDIOENGINE_MP3_PERSIST_ENABLED?.trim() !== "false",
    wavPersistEnabled: envFlagTrue(env, "AUDIOENGINE_WAV_PERSIST_ENABLED"),
    flacPersistEnabled: envFlagTrue(env, "AUDIOENGINE_FLAC_PERSIST_ENABLED"),
    legacyengineFallbackEnabled: envFlagTrue(env, "LEGACYENGINE_FALLBACK_ENABLED"),
    model: env.AUDIOENGINE_MODEL?.trim() || "audioengine-9",
    songCount: AUDIOENGINE_OUTPUT_COUNT,
    workerConcurrency:
      Number.isFinite(workerConcurrency) && workerConcurrency > 0
        ? Math.floor(workerConcurrency)
        : 1,
    providerConcurrency:
      Number.isFinite(providerConcurrency) && providerConcurrency > 0
        ? Math.floor(providerConcurrency)
        : 1,
    vocalCloneConcurrency:
      Number.isFinite(vocalCloneConcurrency) && vocalCloneConcurrency > 0
        ? Math.floor(vocalCloneConcurrency)
        : 1,
    baseUrl: parsedBaseUrl.ok ? parsedBaseUrl.baseUrl : "",
    baseUrlConfigured: baseUrlMeta.baseUrlConfigured,
    baseUrlValid: baseUrlMeta.baseUrlValid,
    baseUrlProtocol: baseUrlMeta.protocol,
    baseUrlHostname: baseUrlMeta.hostname,
    apiKeyConfigured: Boolean(env.AUDIOENGINE_API_KEY?.trim()),
  };
}

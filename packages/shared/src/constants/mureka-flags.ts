/**
 * Mureka staging feature flags — production-safe defaults (all off).
 * Resolved from env; never enable in production without explicit rollout.
 */

import {
  describeMurekaBaseUrl,
  parseMurekaBaseUrl,
} from "./mureka-base-url.js";
import {
  MUREKA_OUTPUT_COUNT,
} from "./mureka-economics.js";

export const MUREKA_SUPPORTED_LYRICS_LANGUAGES = [
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

export type MurekaSupportedLyricsLanguage =
  (typeof MUREKA_SUPPORTED_LYRICS_LANGUAGES)[number];

export function isMurekaSupportedLyricsLanguage(
  value: string,
): value is MurekaSupportedLyricsLanguage {
  return (MUREKA_SUPPORTED_LYRICS_LANGUAGES as readonly string[]).includes(value);
}

export const MUREKA_VOCAL_CLONE_MIN_DURATION_SEC = 15;
export const MUREKA_VOCAL_CLONE_MAX_DURATION_SEC = 30;
export const MUREKA_VOCAL_CLONE_MAX_BYTES = 10 * 1024 * 1024;

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

export interface MurekaFeatureFlags {
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
  sunoFallbackEnabled: boolean;
  model: string;
  /**
   * Lyrics-to-Song `n` — always {@link MUREKA_OUTPUT_COUNT} (1).
   * `MUREKA_SONG_COUNT` env is deprecated and ignored.
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

export function resolveMurekaFeatureFlags(
  env: NodeJS.ProcessEnv = process.env,
): MurekaFeatureFlags {
  // MUREKA_SONG_COUNT is deprecated: product invariant is always one output.
  void env.MUREKA_SONG_COUNT;
  const workerConcurrency = Number(env.MUREKA_WORKER_CONCURRENCY ?? 1);
  const providerConcurrency = Number(env.MUREKA_PROVIDER_CONCURRENCY ?? 1);
  const vocalCloneConcurrency = Number(env.MUREKA_VOCAL_CLONE_CONCURRENCY ?? 1);
  const baseUrlRaw = env.MUREKA_BASE_URL;
  const baseUrlMeta = describeMurekaBaseUrl(baseUrlRaw);
  const parsedBaseUrl = parseMurekaBaseUrl(baseUrlRaw);

  return {
    enabled: envFlagTrue(env, "MUREKA_ENABLED"),
    personalVoiceEnabled: envFlagTrue(env, "MUREKA_PERSONAL_VOICE_ENABLED"),
    voiceDeletionEnabled: envFlagTrue(env, "MUREKA_VOICE_DELETION_ENABLED"),
    productionRolloutEnabled: envFlagTrue(env, "MUREKA_PRODUCTION_ROLLOUT_ENABLED"),
    mp3PersistEnabled: env.MUREKA_MP3_PERSIST_ENABLED?.trim() !== "false",
    wavPersistEnabled: envFlagTrue(env, "MUREKA_WAV_PERSIST_ENABLED"),
    flacPersistEnabled: envFlagTrue(env, "MUREKA_FLAC_PERSIST_ENABLED"),
    sunoFallbackEnabled: envFlagTrue(env, "SUNO_FALLBACK_ENABLED"),
    model: env.MUREKA_MODEL?.trim() || "mureka-9",
    songCount: MUREKA_OUTPUT_COUNT,
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
    apiKeyConfigured: Boolean(env.MUREKA_API_KEY?.trim()),
  };
}

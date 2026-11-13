/**
 * Audioengine Personal Voice availability — fail-closed production rollout gate.
 *
 * Song provider SoT remains Personal Voice toggle (not MUSIC_DEFAULT_PROVIDER).
 * Production additionally requires explicit AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED=true.
 */

import { resolveAudioengineFeatureFlags, type AudioengineFeatureFlags } from "./audioengine-flags.js";

export type AudioenginePersonalVoiceUnavailableReason =
  | "production_rollout_disabled"
  | "audioengine_disabled"
  | "personal_voice_disabled"
  | "runtime_not_ready";

export type AudioenginePersonalVoiceAvailability = {
  available: boolean;
  reason: AudioenginePersonalVoiceUnavailableReason | null;
  productionRolloutEnabled: boolean;
  /** Same prerequisites the worker uses before listening to audioengine-provider-jobs. */
  workerListenReady: boolean;
  enabled: boolean;
  personalVoiceEnabled: boolean;
  apiKeyConfigured: boolean;
  baseUrlValid: boolean;
};

function isProductionAppEnv(appEnv: string | undefined): boolean {
  return appEnv === "production";
}

/**
 * Whether the worker should listen to `audioengine-provider-jobs`.
 * Production requires the rollout gate; staging/dev keep prior key+URL+enabled checks.
 */
export function isAudioengineWorkerListenReady(
  appEnv: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  flags: AudioengineFeatureFlags = resolveAudioengineFeatureFlags(env),
): boolean {
  if (!flags.enabled || !flags.baseUrlValid || !flags.apiKeyConfigured) {
    return false;
  }

  if (isProductionAppEnv(appEnv) && !flags.productionRolloutEnabled) {
    return false;
  }

  return true;
}

/**
 * Canonical Personal Voice / Audioengine song-path availability.
 *
 * Production (all required):
 * - AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED
 * - AUDIOENGINE_ENABLED
 * - AUDIOENGINE_PERSONAL_VOICE_ENABLED
 * - valid API key + HTTPS base URL (worker-listen ready)
 *
 * Non-production (staging/dev — unchanged intent):
 * - AUDIOENGINE_ENABLED + AUDIOENGINE_PERSONAL_VOICE_ENABLED
 * Generate path separately requires workerListenReady before spend/enqueue.
 */
export function resolveAudioenginePersonalVoiceAvailability(input: {
  appEnv: string | undefined;
  env?: NodeJS.ProcessEnv;
}): AudioenginePersonalVoiceAvailability {
  const env = input.env ?? process.env;
  const flags = resolveAudioengineFeatureFlags(env);
  const workerListenReady = isAudioengineWorkerListenReady(input.appEnv, env, flags);

  const base = {
    productionRolloutEnabled: flags.productionRolloutEnabled,
    workerListenReady,
    enabled: flags.enabled,
    personalVoiceEnabled: flags.personalVoiceEnabled,
    apiKeyConfigured: flags.apiKeyConfigured,
    baseUrlValid: flags.baseUrlValid,
  };

  if (isProductionAppEnv(input.appEnv)) {
    if (!flags.productionRolloutEnabled) {
      return {
        ...base,
        available: false,
        reason: "production_rollout_disabled",
      };
    }
    if (!flags.enabled) {
      return { ...base, available: false, reason: "audioengine_disabled" };
    }
    if (!flags.personalVoiceEnabled) {
      return { ...base, available: false, reason: "personal_voice_disabled" };
    }
    if (!flags.apiKeyConfigured || !flags.baseUrlValid) {
      return { ...base, available: false, reason: "runtime_not_ready" };
    }
    return { ...base, available: true, reason: null };
  }

  if (!flags.enabled) {
    return { ...base, available: false, reason: "audioengine_disabled" };
  }
  if (!flags.personalVoiceEnabled) {
    return { ...base, available: false, reason: "personal_voice_disabled" };
  }

  return { ...base, available: true, reason: null };
}

/**
 * True when API may spend/enqueue a Audioengine music job (feature on + worker can listen).
 */
export function isAudioengineGenerateRuntimeReady(input: {
  appEnv: string | undefined;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const availability = resolveAudioenginePersonalVoiceAvailability(input);
  return availability.available && availability.workerListenReady;
}

/** UI / ops helper — same as personal-voice feature availability. */
export function isAudioengineUiEnabled(
  appEnv: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolveAudioenginePersonalVoiceAvailability({ appEnv, env }).available;
}

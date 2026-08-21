/**
 * Mureka Personal Voice availability — fail-closed production rollout gate.
 *
 * Song provider SoT remains Personal Voice toggle (not MUSIC_DEFAULT_PROVIDER).
 * Production additionally requires explicit MUREKA_PRODUCTION_ROLLOUT_ENABLED=true.
 */

import { resolveMurekaFeatureFlags, type MurekaFeatureFlags } from "./mureka-flags.js";

export type MurekaPersonalVoiceUnavailableReason =
  | "production_rollout_disabled"
  | "mureka_disabled"
  | "personal_voice_disabled"
  | "runtime_not_ready";

export type MurekaPersonalVoiceAvailability = {
  available: boolean;
  reason: MurekaPersonalVoiceUnavailableReason | null;
  productionRolloutEnabled: boolean;
  /** Same prerequisites the worker uses before listening to mureka-provider-jobs. */
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
 * Whether the worker should listen to `mureka-provider-jobs`.
 * Production requires the rollout gate; staging/dev keep prior key+URL+enabled checks.
 */
export function isMurekaWorkerListenReady(
  appEnv: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  flags: MurekaFeatureFlags = resolveMurekaFeatureFlags(env),
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
 * Canonical Personal Voice / Mureka song-path availability.
 *
 * Production (all required):
 * - MUREKA_PRODUCTION_ROLLOUT_ENABLED
 * - MUREKA_ENABLED
 * - MUREKA_PERSONAL_VOICE_ENABLED
 * - valid API key + HTTPS base URL (worker-listen ready)
 *
 * Non-production (staging/dev — unchanged intent):
 * - MUREKA_ENABLED + MUREKA_PERSONAL_VOICE_ENABLED
 * Generate path separately requires workerListenReady before spend/enqueue.
 */
export function resolveMurekaPersonalVoiceAvailability(input: {
  appEnv: string | undefined;
  env?: NodeJS.ProcessEnv;
}): MurekaPersonalVoiceAvailability {
  const env = input.env ?? process.env;
  const flags = resolveMurekaFeatureFlags(env);
  const workerListenReady = isMurekaWorkerListenReady(input.appEnv, env, flags);

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
      return { ...base, available: false, reason: "mureka_disabled" };
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
    return { ...base, available: false, reason: "mureka_disabled" };
  }
  if (!flags.personalVoiceEnabled) {
    return { ...base, available: false, reason: "personal_voice_disabled" };
  }

  return { ...base, available: true, reason: null };
}

/**
 * True when API may spend/enqueue a Mureka music job (feature on + worker can listen).
 */
export function isMurekaGenerateRuntimeReady(input: {
  appEnv: string | undefined;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const availability = resolveMurekaPersonalVoiceAvailability(input);
  return availability.available && availability.workerListenReady;
}

/** UI / ops helper — same as personal-voice feature availability. */
export function isMurekaUiEnabled(
  appEnv: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolveMurekaPersonalVoiceAvailability({ appEnv, env }).available;
}

import {
  OPERATION_COST_CREDITS,
  OPERATION_COST_UNITS,
  type CreditUnits,
} from "./credits-economy.js";
import { AUDIOENGINE_ECONOMICS } from "./audioengine-economics.js";

/**
 * Product credit costs for Audioengine (display credits).
 * Sourced from OPERATION_COST_* — do not hardcode divergent numbers.
 */
export const AUDIOENGINE_CREDIT_COSTS = {
  createPersonalVoice: OPERATION_COST_CREDITS.createPersonalVoice,
  generateSongs: OPERATION_COST_CREDITS.generateSongs,
} as const;

/** Ledger units for Audioengine operations (1 credit = 1000 units). */
export const AUDIOENGINE_CREDIT_COST_UNITS = {
  createPersonalVoice: OPERATION_COST_UNITS.createPersonalVoice,
  generateSongs: OPERATION_COST_UNITS.generateSongs,
} as const satisfies Record<keyof typeof AUDIOENGINE_CREDIT_COSTS, CreditUnits>;

/**
 * Provider USD snapshot for observability / admin only.
 * Never use to compute user-facing credit charges.
 * Authoritative contract: `AUDIOENGINE_ECONOMICS`.
 */
export const AUDIOENGINE_PROVIDER_PRICING = AUDIOENGINE_ECONOMICS;

export const AUDIOENGINE_OPERATION_VERSION = "v1" as const;

export function buildAudioengineVoiceProfileSpendKey(voiceProfileId: string): string {
  return `voice-profile:${voiceProfileId}:audioengine:${AUDIOENGINE_OPERATION_VERSION}:spend`;
}

export function buildAudioengineVoiceProfileRefundKey(voiceProfileId: string): string {
  return `voice-profile:${voiceProfileId}:audioengine:${AUDIOENGINE_OPERATION_VERSION}:refund`;
}

export function buildAudioengineVoiceProfileOperationKey(
  userId: string,
  voiceSampleId: string,
): string {
  return `voice-profile:${userId}:${voiceSampleId}:audioengine:${AUDIOENGINE_OPERATION_VERSION}`;
}

export function buildAudioengineMusicSpendKey(generationId: string): string {
  return `music-generation:${generationId}:audioengine:${AUDIOENGINE_OPERATION_VERSION}:spend`;
}

export function buildAudioengineMusicRefundKey(generationId: string): string {
  return `music-generation:${generationId}:audioengine:${AUDIOENGINE_OPERATION_VERSION}:refund`;
}

export function buildAudioengineMusicOperationKey(generationId: string): string {
  return `music-generation:${generationId}:audioengine:${AUDIOENGINE_OPERATION_VERSION}`;
}

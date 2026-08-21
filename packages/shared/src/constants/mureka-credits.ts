import {
  OPERATION_COST_CREDITS,
  OPERATION_COST_UNITS,
  type CreditUnits,
} from "./credits-economy.js";
import { MUREKA_ECONOMICS } from "./mureka-economics.js";

/**
 * Product credit costs for Mureka (display credits).
 * Sourced from OPERATION_COST_* — do not hardcode divergent numbers.
 */
export const MUREKA_CREDIT_COSTS = {
  createPersonalVoice: OPERATION_COST_CREDITS.createPersonalVoice,
  generateSongs: OPERATION_COST_CREDITS.generateSongs,
} as const;

/** Ledger units for Mureka operations (1 credit = 1000 units). */
export const MUREKA_CREDIT_COST_UNITS = {
  createPersonalVoice: OPERATION_COST_UNITS.createPersonalVoice,
  generateSongs: OPERATION_COST_UNITS.generateSongs,
} as const satisfies Record<keyof typeof MUREKA_CREDIT_COSTS, CreditUnits>;

/**
 * Provider USD snapshot for observability / admin only.
 * Never use to compute user-facing credit charges.
 * Authoritative contract: `MUREKA_ECONOMICS`.
 */
export const MUREKA_PROVIDER_PRICING = MUREKA_ECONOMICS;

export const MUREKA_OPERATION_VERSION = "v1" as const;

export function buildMurekaVoiceProfileSpendKey(voiceProfileId: string): string {
  return `voice-profile:${voiceProfileId}:mureka:${MUREKA_OPERATION_VERSION}:spend`;
}

export function buildMurekaVoiceProfileRefundKey(voiceProfileId: string): string {
  return `voice-profile:${voiceProfileId}:mureka:${MUREKA_OPERATION_VERSION}:refund`;
}

export function buildMurekaVoiceProfileOperationKey(
  userId: string,
  voiceSampleId: string,
): string {
  return `voice-profile:${userId}:${voiceSampleId}:mureka:${MUREKA_OPERATION_VERSION}`;
}

export function buildMurekaMusicSpendKey(generationId: string): string {
  return `music-generation:${generationId}:mureka:${MUREKA_OPERATION_VERSION}:spend`;
}

export function buildMurekaMusicRefundKey(generationId: string): string {
  return `music-generation:${generationId}:mureka:${MUREKA_OPERATION_VERSION}:refund`;
}

export function buildMurekaMusicOperationKey(generationId: string): string {
  return `music-generation:${generationId}:mureka:${MUREKA_OPERATION_VERSION}`;
}

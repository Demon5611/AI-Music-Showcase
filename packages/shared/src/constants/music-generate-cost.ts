import {
  OPERATION_COST_UNITS,
  type CreditUnits,
  unitsToCredits,
} from "./credits-economy.js";
import { MUREKA_CREDIT_COST_UNITS } from "./mureka-credits.js";

/**
 * Single source for song-generation credit cost (ledger units).
 * Personal Voice (Mureka) → generateSongs (24);
 * otherwise Suno → generateTrack (15).
 */
export function resolveMusicGenerateCostUnits(input: {
  usePersonalVoice?: boolean;
  providerId?: string;
}): CreditUnits {
  if (input.usePersonalVoice === true || input.providerId === "mureka") {
    return MUREKA_CREDIT_COST_UNITS.generateSongs;
  }

  return OPERATION_COST_UNITS.generateTrack;
}

export function canAffordMusicGenerate(
  balanceCredits: number,
  input: { usePersonalVoice?: boolean; providerId?: string } = {},
): boolean {
  return balanceCredits >= unitsToCredits(resolveMusicGenerateCostUnits(input));
}

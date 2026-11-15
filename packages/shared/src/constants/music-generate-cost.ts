import {
  OPERATION_COST_UNITS,
  type CreditUnits,
  unitsToCredits,
} from "./credits-economy.js";
import { AUDIOENGINE_CREDIT_COST_UNITS } from "./audioengine-credits.js";

/**
 * Single source for song-generation credit cost (ledger units).
 * Personal Voice (Audioengine) → generateSongs (24);
 * otherwise Legacyengine → generateTrack (15).
 */
export function resolveMusicGenerateCostUnits(input: {
  usePersonalVoice?: boolean;
  providerId?: string;
}): CreditUnits {
  if (input.usePersonalVoice === true || input.providerId === "audioengine") {
    return AUDIOENGINE_CREDIT_COST_UNITS.generateSongs;
  }

  return OPERATION_COST_UNITS.generateTrack;
}

export function canAffordMusicGenerate(
  balanceCredits: number,
  input: { usePersonalVoice?: boolean; providerId?: string } = {},
): boolean {
  return balanceCredits >= unitsToCredits(resolveMusicGenerateCostUnits(input));
}

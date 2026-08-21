import type { MusicComboStylePreset } from "@ai-music/shared";
import { MUSIC_COMBO_STYLE_PRESETS } from "@ai-music/shared";

/** Message keys under MusicCreate.comboStyles — keyed by API style string. */
export const COMBO_STYLE_MESSAGE_KEYS = [
  "dreamyLofi",
  "energeticHyperpop",
  "gloomyBedroom",
  "emotionalIndie",
  "darkTrap",
  "chargedPopPunk",
  "danceElectropop",
  "nostalgic2000s",
  "aggressiveRage",
  "melodicEmo",
] as const;

export type ComboStyleMessageKey = (typeof COMBO_STYLE_MESSAGE_KEYS)[number];

export function resolveComboStyleMessageKey(
  preset: MusicComboStylePreset,
): ComboStyleMessageKey | null {
  const index = MUSIC_COMBO_STYLE_PRESETS.findIndex(
    (item) => item.style.trim().toLowerCase() === preset.style.trim().toLowerCase(),
  );

  if (index < 0 || index >= COMBO_STYLE_MESSAGE_KEYS.length) {
    return null;
  }

  return COMBO_STYLE_MESSAGE_KEYS[index] ?? null;
}

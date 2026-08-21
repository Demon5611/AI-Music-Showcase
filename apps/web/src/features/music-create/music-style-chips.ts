/** Suno custom mode: comma-separated tags; first tags have the most weight. */
export const MAX_SELECTED_STYLE_CHIPS = 7;

/** Recommended range for coherent Suno output (see sunoapi.md + provider docs). */
export const RECOMMENDED_STYLE_CHIPS_MIN = 5;

export const MUSIC_STYLE_CHIP_OPTIONS = [
  "pop",
  "electropop",
  "hip-hop",
  "trap",
  "emo rap",
  "lo-fi chill",
  "indie rock",
  "pop-punk",
  "house",
  "electro house"
] as const;

export type MusicStyleChip = (typeof MUSIC_STYLE_CHIP_OPTIONS)[number];

export function parseStyleTags(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isStyleChipSelected(style: string, chip: string): boolean {
  const normalized = chip.toLowerCase();
  return parseStyleTags(style).some((tag) => tag.toLowerCase() === normalized);
}

export function toggleStyleChip(
  currentStyle: string,
  chip: string,
  maxChips: number,
  maxLength: number,
): string {
  const tags = parseStyleTags(currentStyle);
  const normalized = chip.toLowerCase();
  const index = tags.findIndex((tag) => tag.toLowerCase() === normalized);

  if (index >= 0) {
    tags.splice(index, 1);
    return tags.join(", ");
  }

  if (tags.length >= maxChips) {
    return currentStyle;
  }

  const next = [...tags, chip].join(", ");
  if (next.length > maxLength) {
    return currentStyle;
  }

  return next;
}

export function isStyleChipDisabled(
  style: string,
  chip: string,
  maxChips: number,
  maxLength: number,
): boolean {
  if (isStyleChipSelected(style, chip)) {
    return false;
  }

  if (parseStyleTags(style).length >= maxChips) {
    return true;
  }

  const candidate = [...parseStyleTags(style), chip].join(", ");
  return candidate.length > maxLength;
}

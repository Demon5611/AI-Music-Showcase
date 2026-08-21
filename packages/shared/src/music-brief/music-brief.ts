/**
 * Provider-neutral music brief. Lyrics stay separate — never mix into brief fields.
 */
export type MusicBrief = {
  genre?: string;
  mood?: string;
  tempo?: string;
  instruments?: string[];
  arrangement?: string;
  vocalPresentation?: string;
  vocalRange?: string;
  chorusIntensity?: string;
  additionalInstructions?: string;
};

function pushPart(parts: string[], label: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) {
    parts.push(`${label}: ${trimmed}`);
  }
}

/**
 * Build Mureka `prompt` (style/arrangement description) from a MusicBrief.
 * Does not include lyrics. No hardcoded Russian instructions.
 */
export function buildMurekaPrompt(brief: MusicBrief): string {
  const parts: string[] = [];

  pushPart(parts, "genre", brief.genre);
  pushPart(parts, "mood", brief.mood);
  pushPart(parts, "tempo", brief.tempo);

  if (brief.instruments?.length) {
    const instruments = brief.instruments.map((item) => item.trim()).filter(Boolean);
    if (instruments.length > 0) {
      parts.push(`instruments: ${instruments.join(", ")}`);
    }
  }

  pushPart(parts, "arrangement", brief.arrangement);
  pushPart(parts, "vocal presentation", brief.vocalPresentation);
  pushPart(parts, "vocal range", brief.vocalRange);
  pushPart(parts, "chorus intensity", brief.chorusIntensity);
  pushPart(parts, "additional", brief.additionalInstructions);

  return parts.join(". ");
}

/**
 * Build a comma-separated Suno-style tags string from MusicBrief (legacy path).
 */
export function buildSunoStyle(brief: MusicBrief): string {
  const tags: string[] = [];

  for (const value of [
    brief.genre,
    brief.mood,
    brief.tempo,
    brief.arrangement,
    brief.vocalPresentation,
    brief.vocalRange,
    brief.chorusIntensity,
  ]) {
    const trimmed = value?.trim();
    if (trimmed) {
      tags.push(trimmed);
    }
  }

  if (brief.instruments?.length) {
    for (const instrument of brief.instruments) {
      const trimmed = instrument.trim();
      if (trimmed) {
        tags.push(trimmed);
      }
    }
  }

  if (brief.additionalInstructions?.trim()) {
    tags.push(brief.additionalInstructions.trim());
  }

  return tags.join(", ");
}

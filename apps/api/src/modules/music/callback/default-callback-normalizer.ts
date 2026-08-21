import { createSunoMusicCallbackNormalizer } from "@ai-music/ai-providers";
import type { MusicGenerationCallbackNormalizer } from "@ai-music/ai-providers";

/**
 * Composition root for signed/legacy Suno callback routes.
 * No dynamic provider from URL — this route is Suno-only.
 */
export function createDefaultSunoCallbackNormalizer(): MusicGenerationCallbackNormalizer {
  return createSunoMusicCallbackNormalizer();
}

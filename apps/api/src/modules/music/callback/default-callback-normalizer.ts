import { createLegacyengineMusicCallbackNormalizer } from "@ai-music/ai-providers";
import type { MusicGenerationCallbackNormalizer } from "@ai-music/ai-providers";

/**
 * Composition root for signed/legacy Legacyengine callback routes.
 * No dynamic provider from URL — this route is Legacyengine-only.
 */
export function createDefaultLegacyengineCallbackNormalizer(): MusicGenerationCallbackNormalizer {
  return createLegacyengineMusicCallbackNormalizer();
}

import {
  createLegacyengineMusicGenerationProvider,
  getLegacyengineRateLimiter,
  type MusicGenerationProvider,
} from "@ai-music/ai-providers";
import type { MusicGenerateSubmitDeps } from "./submit-deps.js";

/**
 * Production composition root for music_generate submit.
 * This is intentionally Legacyengine-only for the provider-jobs queue.
 * Audioengine uses audioengine-provider-jobs and its dedicated processor.
 */
export function createDefaultMusicGenerateSubmitDeps(
  provider: MusicGenerationProvider = createLegacyengineMusicGenerationProvider(),
): MusicGenerateSubmitDeps {
  return {
    provider,
    acquireSubmitPermit: () => getLegacyengineRateLimiter().acquire(),
  };
}

import {
  createSunoMusicGenerationProvider,
  getSunoRateLimiter,
  type MusicGenerationProvider,
} from "@ai-music/ai-providers";
import type { MusicGenerateSubmitDeps } from "./submit-deps.js";

/**
 * Production composition root for music_generate submit.
 * This is intentionally Suno-only for the provider-jobs queue.
 * Mureka uses mureka-provider-jobs and its dedicated processor.
 */
export function createDefaultMusicGenerateSubmitDeps(
  provider: MusicGenerationProvider = createSunoMusicGenerationProvider(),
): MusicGenerateSubmitDeps {
  return {
    provider,
    acquireSubmitPermit: () => getSunoRateLimiter().acquire(),
  };
}

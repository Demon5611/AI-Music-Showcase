import { isShowcaseMode } from "@ai-music/shared";
import type { MusicProviderId } from "./domain/music-provider-id.js";
import type { MusicGenerationProvider } from "./domain/music-generation-provider.js";
import { MusicProviderError } from "./domain/errors/music-provider.error.js";
import { createMockMusicGenerationProvider } from "./providers/mock/mock-music-generation.provider.js";
import { createMurekaMusicGenerationProvider } from "./providers/mureka/mureka-music-generation.provider.js";
import { createSunoMusicGenerationProvider } from "./providers/suno-api/suno-music-generation.provider.js";

/**
 * Resolve MusicGenerationProvider by persisted provider id (not current env).
 * SHOWCASE_MODE always returns the deterministic mock adapter.
 */
export function createMusicGenerationProvider(
  providerId: MusicProviderId,
): MusicGenerationProvider {
  if (isShowcaseMode() || providerId === "mock") {
    return createMockMusicGenerationProvider();
  }

  switch (providerId) {
    case "sunoapi":
      return createSunoMusicGenerationProvider();
    case "mureka":
      return createMurekaMusicGenerationProvider();
    default:
      throw new MusicProviderError(
        `Unsupported music generation provider: ${providerId}`,
        "UNSUPPORTED_MUSIC_PROVIDER",
        providerId,
        500,
      );
  }
}


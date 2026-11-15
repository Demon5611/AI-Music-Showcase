import { isShowcaseMode } from "@ai-music/shared";
import type { MusicProviderId } from "./domain/music-provider-id.js";
import type { MusicGenerationProvider } from "./domain/music-generation-provider.js";
import { MusicProviderError } from "./domain/errors/music-provider.error.js";
import { createMockMusicGenerationProvider } from "./providers/mock/mock-music-generation.provider.js";
import { createAudioengineMusicGenerationProvider } from "./providers/audioengine/audioengine-music-generation.provider.js";
import { createLegacyengineMusicGenerationProvider } from "./providers/legacyengine-api/legacyengine-music-generation.provider.js";

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
    case "legacyengineapi":
      return createLegacyengineMusicGenerationProvider();
    case "audioengine":
      return createAudioengineMusicGenerationProvider();
    default:
      throw new MusicProviderError(
        `Unsupported music generation provider: ${providerId}`,
        "UNSUPPORTED_MUSIC_PROVIDER",
        providerId,
        500,
      );
  }
}


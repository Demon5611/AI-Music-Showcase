import type {
  GenerateLyricsInput,
  GenerateLyricsResult,
  GenerationStatusResult,
} from "./domain/music.types.js";
import { createLegacyengineApiProvider } from "./providers/legacyengine-api/legacyengine-api.provider.js";

/**
 * Lyrics generation is provider-neutral product-wise: it always uses the Legacyengine
 * lyrics API engine and must NOT follow MUSIC_DEFAULT_PROVIDER / MUSIC_PROVIDER.
 * Song generation may route to Audioengine; lyrics must keep working independently.
 */
export type LyricsEngine = {
  generateLyrics(input: GenerateLyricsInput): Promise<GenerateLyricsResult>;
  getLyricsGenerationStatus(taskId: string): Promise<GenerationStatusResult>;
};

type LyricsCapableProvider = {
  generateLyrics?(input: GenerateLyricsInput): Promise<GenerateLyricsResult>;
  getLyricsGenerationStatus?(taskId: string): Promise<GenerationStatusResult>;
};

export function createLyricsEngine(
  legacyengineProvider: LyricsCapableProvider = createLegacyengineApiProvider(),
): LyricsEngine {
  if (!legacyengineProvider.generateLyrics || !legacyengineProvider.getLyricsGenerationStatus) {
    throw new Error("Legacyengine lyrics engine is not available");
  }

  const generateLyrics = legacyengineProvider.generateLyrics.bind(legacyengineProvider);
  const getLyricsGenerationStatus =
    legacyengineProvider.getLyricsGenerationStatus.bind(legacyengineProvider);

  return {
    generateLyrics,
    getLyricsGenerationStatus,
  };
}

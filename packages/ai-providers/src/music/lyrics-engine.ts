import type {
  GenerateLyricsInput,
  GenerateLyricsResult,
  GenerationStatusResult,
} from "./domain/music.types.js";
import { createSunoApiProvider } from "./providers/suno-api/suno-api.provider.js";

/**
 * Lyrics generation is provider-neutral product-wise: it always uses the Suno
 * lyrics API engine and must NOT follow MUSIC_DEFAULT_PROVIDER / MUSIC_PROVIDER.
 * Song generation may route to Mureka; lyrics must keep working independently.
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
  sunoProvider: LyricsCapableProvider = createSunoApiProvider(),
): LyricsEngine {
  if (!sunoProvider.generateLyrics || !sunoProvider.getLyricsGenerationStatus) {
    throw new Error("Suno lyrics engine is not available");
  }

  const generateLyrics = sunoProvider.generateLyrics.bind(sunoProvider);
  const getLyricsGenerationStatus =
    sunoProvider.getLyricsGenerationStatus.bind(sunoProvider);

  return {
    generateLyrics,
    getLyricsGenerationStatus,
  };
}

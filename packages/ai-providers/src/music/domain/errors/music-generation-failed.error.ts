import type { MusicProviderId } from "../music-provider-id.js";
import { MusicProviderError } from "./music-provider.error.js";

export class MusicGenerationFailedError extends MusicProviderError {
  constructor(
    provider: MusicProviderId,
    message = "Music generation failed",
    cause?: unknown,
  ) {
    super(message, "MUSIC_GENERATION_FAILED", provider, 502, cause);
    this.name = "MusicGenerationFailedError";
  }
}

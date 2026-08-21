import type { MusicProviderId } from "../music-provider-id.js";
import { MusicProviderError } from "./music-provider.error.js";

export class MusicInvalidPromptError extends MusicProviderError {
  constructor(provider: MusicProviderId, message = "Invalid music generation prompt") {
    super(message, "MUSIC_INVALID_PROMPT", provider, 400);
    this.name = "MusicInvalidPromptError";
  }
}

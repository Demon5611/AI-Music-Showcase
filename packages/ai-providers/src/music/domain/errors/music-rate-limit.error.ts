import type { MusicProviderId } from "../music-provider-id.js";
import { MusicProviderError } from "./music-provider.error.js";

export class MusicRateLimitError extends MusicProviderError {
  constructor(provider: MusicProviderId, message = "Music provider rate limit exceeded") {
    super(message, "MUSIC_RATE_LIMIT", provider, 429);
    this.name = "MusicRateLimitError";
  }
}

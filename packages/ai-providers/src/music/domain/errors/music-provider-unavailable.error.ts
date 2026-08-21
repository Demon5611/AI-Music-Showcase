import type { MusicProviderId } from "../music-provider-id.js";
import { MusicProviderError } from "./music-provider.error.js";

export class MusicProviderUnavailableError extends MusicProviderError {
  constructor(
    provider: MusicProviderId,
    message = "Music provider is temporarily unavailable",
    cause?: unknown,
  ) {
    super(message, "MUSIC_PROVIDER_UNAVAILABLE", provider, 503, cause);
    this.name = "MusicProviderUnavailableError";
  }
}

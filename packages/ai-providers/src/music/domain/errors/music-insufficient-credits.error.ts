import type { MusicProviderId } from "../music-provider-id.js";
import { MusicProviderError } from "./music-provider.error.js";

export class MusicInsufficientCreditsError extends MusicProviderError {
  constructor(
    provider: MusicProviderId,
    message = "Insufficient credits on music provider account",
  ) {
    super(message, "MUSIC_INSUFFICIENT_CREDITS", provider, 402);
    this.name = "MusicInsufficientCreditsError";
  }
}

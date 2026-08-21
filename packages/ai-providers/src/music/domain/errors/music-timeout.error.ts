import type { MusicProviderId } from "../music-provider-id.js";
import { MusicProviderError } from "./music-provider.error.js";

export class MusicTimeoutError extends MusicProviderError {
  constructor(
    provider: MusicProviderId,
    message = "Music provider request timed out",
  ) {
    super(message, "MUSIC_TIMEOUT", provider, 504);
    this.name = "MusicTimeoutError";
  }
}

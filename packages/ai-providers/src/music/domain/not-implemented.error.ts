import type { MusicProviderId } from "./music-provider-id.js";
import { MusicProviderError } from "./errors/music-provider.error.js";

export class NotImplementedMusicProviderError extends MusicProviderError {
  constructor(provider: MusicProviderId, method: string) {
    super(
      `${provider} provider: ${method} is not implemented yet`,
      "MUSIC_PROVIDER_NOT_IMPLEMENTED",
      provider,
      501,
    );
    this.name = "NotImplementedMusicProviderError";
  }
}

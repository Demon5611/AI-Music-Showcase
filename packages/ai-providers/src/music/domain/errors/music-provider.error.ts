import type { MusicProviderId } from "../music-provider-id.js";

export class MusicProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: MusicProviderId,
    public readonly statusCode = 502,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "MusicProviderError";
  }
}

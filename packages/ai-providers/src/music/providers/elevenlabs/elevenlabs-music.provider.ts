import { StubMusicProvider } from "../stub-music.provider.js";

/**
 * Future ElevenLabs Music adapter (async task-based API).
 */
export class ElevenLabsMusicProviderAdapter extends StubMusicProvider {
  readonly id = "elevenlabs" as const;
}

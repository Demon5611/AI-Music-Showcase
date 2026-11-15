import { StubMusicProvider } from "../stub-music.provider.js";

/**
 * Future Voiceengine Music adapter (async task-based API).
 */
export class VoiceengineMusicProviderAdapter extends StubMusicProvider {
  readonly id = "voiceengine" as const;
}

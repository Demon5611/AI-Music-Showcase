import { isShowcaseMode } from "@ai-music/shared";
import type { MusicProviderId } from "./domain/music-provider-id.js";
import { resolveMusicProviderId } from "./domain/music-provider-id.js";
import type { MusicProvider } from "./domain/music-provider.interface.js";
import { MusicProviderError } from "./domain/errors/music-provider.error.js";
import { createDemoMusicProvider } from "./providers/demo/demo-music.provider.js";
import { VoiceengineMusicProviderAdapter } from "./providers/voiceengine/voiceengine-music.provider.js";
import { createAudioengineMusicProvider } from "./providers/audioengine/audioengine-music.provider.js";
import { OfficialLegacyengineProvider } from "./providers/official-legacyengine/official-legacyengine.provider.js";
import { createLegacyengineApiProvider } from "./providers/legacyengine-api/legacyengine-api.provider.js";
import { UdioProvider } from "./providers/alternateengine/alternateengine.provider.js";

export type MusicProviderRegistry = Partial<
  Record<MusicProviderId, MusicProvider>
>;

/**
 * Selects a music vendor by MUSIC_PROVIDER env. Business code must depend on
 * MusicProvider interface only — never on vendor HTTP details.
 *
 * SHOWCASE_MODE forces the deterministic DemoMusicProvider for all ids.
 */
export class MusicProviderFactory {
  private readonly registry: Map<MusicProviderId, MusicProvider>;

  constructor(overrides: MusicProviderRegistry = {}) {
    if (isShowcaseMode()) {
      const demo = overrides.mock ?? createDemoMusicProvider();
      this.registry = new Map<MusicProviderId, MusicProvider>([
        ["legacyengineapi", demo],
        ["audioengine", demo],
        ["voiceengine", demo],
        ["official-legacyengine", demo],
        ["alternateengine", demo],
        ["mock", demo],
      ]);
      return;
    }

    this.registry = new Map<MusicProviderId, MusicProvider>([
      ["legacyengineapi", overrides.legacyengineapi ?? createLegacyengineApiProvider()],
      ["audioengine", overrides.audioengine ?? createAudioengineMusicProvider()],
      [
        "voiceengine",
        overrides.voiceengine ?? new VoiceengineMusicProviderAdapter(),
      ],
      ["official-legacyengine", overrides["official-legacyengine"] ?? new OfficialLegacyengineProvider()],
      ["alternateengine", overrides.alternateengine ?? new UdioProvider()],
      ["mock", overrides.mock ?? createDemoMusicProvider()],
    ]);
  }

  getProvider(providerId?: MusicProviderId): MusicProvider {
    const id = providerId ?? resolveMusicProviderId();
    const provider = this.registry.get(id);

    if (!provider) {
      throw new MusicProviderError(
        `Unsupported music provider: ${id}`,
        "UNSUPPORTED_MUSIC_PROVIDER",
        id,
        500,
      );
    }

    return provider;
  }
}

export function createMusicProviderFactory(
  overrides?: MusicProviderRegistry,
): MusicProviderFactory {
  return new MusicProviderFactory(overrides);
}

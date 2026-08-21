import { isShowcaseMode } from "@ai-music/shared";
import type { MusicProviderId } from "./domain/music-provider-id.js";
import { resolveMusicProviderId } from "./domain/music-provider-id.js";
import type { MusicProvider } from "./domain/music-provider.interface.js";
import { MusicProviderError } from "./domain/errors/music-provider.error.js";
import { createDemoMusicProvider } from "./providers/demo/demo-music.provider.js";
import { ElevenLabsMusicProviderAdapter } from "./providers/elevenlabs/elevenlabs-music.provider.js";
import { createMurekaMusicProvider } from "./providers/mureka/mureka-music.provider.js";
import { OfficialSunoProvider } from "./providers/official-suno/official-suno.provider.js";
import { createSunoApiProvider } from "./providers/suno-api/suno-api.provider.js";
import { UdioProvider } from "./providers/udio/udio.provider.js";

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
        ["sunoapi", demo],
        ["mureka", demo],
        ["elevenlabs", demo],
        ["official-suno", demo],
        ["udio", demo],
        ["mock", demo],
      ]);
      return;
    }

    this.registry = new Map<MusicProviderId, MusicProvider>([
      ["sunoapi", overrides.sunoapi ?? createSunoApiProvider()],
      ["mureka", overrides.mureka ?? createMurekaMusicProvider()],
      [
        "elevenlabs",
        overrides.elevenlabs ?? new ElevenLabsMusicProviderAdapter(),
      ],
      ["official-suno", overrides["official-suno"] ?? new OfficialSunoProvider()],
      ["udio", overrides.udio ?? new UdioProvider()],
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

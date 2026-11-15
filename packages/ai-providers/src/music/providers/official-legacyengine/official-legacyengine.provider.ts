import { StubMusicProvider } from "../stub-music.provider.js";

export class OfficialLegacyengineProvider extends StubMusicProvider {
  readonly id = "official-legacyengine" as const;
}

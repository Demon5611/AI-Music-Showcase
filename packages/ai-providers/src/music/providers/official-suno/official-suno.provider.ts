import { StubMusicProvider } from "../stub-music.provider.js";

export class OfficialSunoProvider extends StubMusicProvider {
  readonly id = "official-suno" as const;
}

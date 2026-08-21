import { StubMusicProvider } from "../stub-music.provider.js";

export class UdioProvider extends StubMusicProvider {
  readonly id = "udio" as const;
}

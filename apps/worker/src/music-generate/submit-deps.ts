import type { MusicGenerationProvider } from "@ai-music/ai-providers";

export type MusicGenerateSubmitDeps = {
  provider: MusicGenerationProvider;
  acquireSubmitPermit: () => Promise<void>;
};

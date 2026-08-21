import type { MusicProvider } from "../../domain/music-provider.interface.js";
import type {
  ExtendSongInput,
  ExtendSongResult,
  GenerateLyricsInput,
  GenerateLyricsResult,
  GenerateSongInput,
  GenerateSongResult,
  GenerationStatusResult,
} from "../../domain/music.types.js";

/**
 * Deterministic MusicProvider for SHOWCASE_MODE.
 * No external HTTP. Returns stable demo task / track identifiers.
 */
export class DemoMusicProvider implements MusicProvider {
  readonly id = "mock" as const;

  async generateSong(input: GenerateSongInput): Promise<GenerateSongResult> {
    void input;
    return {
      provider: this.id,
      taskId: "provider_job_demo_001",
      status: "pending",
    };
  }

  async generateLyrics(input: GenerateLyricsInput): Promise<GenerateLyricsResult> {
    void input;
    return {
      provider: this.id,
      taskId: "provider_job_demo_lyrics_001",
      status: "pending",
    };
  }

  async getLyricsGenerationStatus(taskId: string): Promise<GenerationStatusResult> {
    return {
      taskId,
      status: "completed",
      provider: this.id,
      lyrics: [
        {
          title: "Demo Song",
          text: "[Verse]\nDemo lyrics for showcase mode.\n\n[Chorus]\nNo external AI providers were called.",
        },
      ],
    };
  }

  async extendSong(input: ExtendSongInput): Promise<ExtendSongResult> {
    void input;
    return {
      provider: this.id,
      taskId: "provider_job_demo_extend_001",
      status: "pending",
    };
  }

  async getGenerationStatus(taskId: string): Promise<GenerationStatusResult> {
    return {
      taskId,
      status: "completed",
      provider: this.id,
      tracks: [
        {
          id: "track_demo_001",
          title: "Demo Track",
          audioUrl: "https://example.invalid/demo/track_demo_001.mp3",
          durationSec: 30,
          lyricsText: "Demo lyrics for showcase mode.",
        },
      ],
    };
  }
}

export function createDemoMusicProvider(): DemoMusicProvider {
  return new DemoMusicProvider();
}

import type { MusicProviderId } from "./music-provider-id.js";
import type {
  AddInstrumentalInput,
  AddVocalsInput,
  AlbumCoverStatusResult,
  AudioResult,
  ExtendSongInput,
  ExtendSongResult,
  GenerateLyricsInput,
  GenerateLyricsResult,
  GenerateSongInput,
  GenerateSongResult,
  GenerationStatusResult,
  SeparateStemsInput,
  StemResult,
  TimestampedLyricsInput,
  TimestampedLyricsResult,
} from "./music.types.js";

/**
 * Music generation contract shared by Suno, ElevenLabs Music, Udio, etc.
 *
 * Abstraction layer keeps API/worker/UI independent from a single vendor so we
 * can switch providers via MUSIC_PROVIDER without rewriting business logic.
 *
 * Voice transfer (Kits) was removed from the editor; Kits client remains for future integrations.
 */
export interface MusicProvider {
  readonly id: MusicProviderId;

  generateSong(input: GenerateSongInput): Promise<GenerateSongResult>;

  generateLyrics?(input: GenerateLyricsInput): Promise<GenerateLyricsResult>;

  getLyricsGenerationStatus?(taskId: string): Promise<GenerationStatusResult>;

  extendSong(input: ExtendSongInput): Promise<ExtendSongResult>;

  getGenerationStatus(taskId: string): Promise<GenerationStatusResult>;

  separateStems?(input: SeparateStemsInput): Promise<StemResult>;

  getStemSeparationStatus?(taskId: string): Promise<StemResult>;

  getTimestampedLyrics?(input: TimestampedLyricsInput): Promise<TimestampedLyricsResult>;

  generateAlbumCover?(sunoMusicTaskId: string): Promise<{ taskId: string }>;

  getAlbumCoverStatus?(taskId: string): Promise<AlbumCoverStatusResult>;

  addVocals?(input: AddVocalsInput): Promise<AudioResult>;

  addInstrumental?(input: AddInstrumentalInput): Promise<AudioResult>;
}

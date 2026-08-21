import type { MusicGenerationStatus } from "./music-status.js";
import type { MusicProviderId } from "./music-provider-id.js";

export interface GenerateLyricsInput {
  prompt: string;
}

export interface GenerateLyricsResult {
  provider: MusicProviderId;
  taskId: string;
  status: MusicGenerationStatus;
}

export type {
  GenerateSongInput,
  PersistedSongInput,
  ProviderGenerationOptions,
  SunoGenerationOptions,
  MurekaGenerationOptions,
} from "./generate-song-input.js";
export {
  fromPersistedSongInput,
  getSunoGenerationOptions,
  getMurekaGenerationOptions,
  isInstrumentalMode,
  requireSunoGenerationOptions,
  toPersistedSongInput,
  withSunoGenerationOptions,
  withMurekaGenerationOptions,
} from "./generate-song-input.js";

export interface ExtendSongInput {
  audioId: string;
  prompt: string;
  continueAtSec: number;
  style?: string;
  title?: string;
}

export interface AlbumCoverStatusResult {
  status: "pending" | "processing" | "completed" | "failed";
  images: string[];
  errorMessage?: string;
}

export interface TimestampedLyricsInput {
  taskId: string;
  audioId: string;
}

export interface TimestampedLyricsLine {
  startSec: number;
  endSec: number;
  text: string;
}

export interface TimestampedLyricsResult {
  lines: TimestampedLyricsLine[];
  words: Array<{
    text: string;
    startSec: number;
    endSec: number;
  }>;
}

export interface GeneratedTrack {
  id: string;
  title: string;
  audioUrl: string;
  streamAudioUrl?: string;
  imageUrl?: string;
  durationSec?: number;
  lyricsText?: string;
  tags?: string;
  /** Optional timed lyrics when provider returns them with the choice. */
  timedLyrics?: TimestampedLyricsLine[];
  /** Safe provider choice metadata (no secrets / no raw dump). */
  metadata?: Record<string, unknown>;
}

export interface GeneratedLyrics {
  title: string;
  text: string;
}

export interface GenerateSongResult {
  provider: MusicProviderId;
  taskId: string;
  status: MusicGenerationStatus;
}

export interface ExtendSongResult {
  provider: MusicProviderId;
  taskId: string;
  status: MusicGenerationStatus;
}

export interface GenerationStatusResult {
  taskId: string;
  status: MusicGenerationStatus;
  provider: MusicProviderId;
  tracks?: GeneratedTrack[];
  lyrics?: GeneratedLyrics[];
  errorMessage?: string;
  rawStatus?: string;
}

export interface SeparateStemsInput {
  providerTaskId: string;
  providerTrackId: string;
  separationType?: "separate_vocal" | "split_stem";
}

export interface StemResult {
  taskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  vocalUrl?: string;
  instrumentalUrl?: string;
  errorMessage?: string;
}

export interface AudioResult {
  audioUrl: string;
  durationSec?: number;
}

export interface AddVocalsInput {
  prompt: string;
  style?: string;
  referenceAudioUrl: string;
}

export interface AddInstrumentalInput {
  prompt: string;
  style?: string;
  referenceAudioUrl: string;
}

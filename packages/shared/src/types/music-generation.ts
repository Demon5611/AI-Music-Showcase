export type MusicGenerationType = "song" | "lyrics";

export type MusicGenerationRecordStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type MusicTrackPersistenceState =
  | "pending"
  | "processing"
  | "stored"
  | "failed";

export type MusicTrackAudioPersistence =
  | "saving"
  | "ready"
  | "failed"
  | "none";

export type MusicTrackAudioStatus =
  | "none"
  | "processing"
  | "stored"
  | "missing"
  | "failed";

export interface MusicGenerationTrackDto {
  id: string;
  providerTrackId: string;
  title: string;
  durationSec: number | null;
  audioUrl: string | null;
  imageUrl: string | null;
  lyricsText: string | null;
  persistenceState: MusicTrackPersistenceState;
  /** Explicit playability — false when storage object is missing/failed. */
  playbackAvailable: boolean;
  audioStatus: MusicTrackAudioStatus;
}

export interface MusicGenerationRecordDto {
  id: string;
  type: MusicGenerationType;
  provider: string;
  providerTaskId: string;
  prompt: string;
  style: string | null;
  title: string | null;
  customMode: boolean;
  instrumental: boolean;
  status: MusicGenerationRecordStatus;
  rawStatus: string | null;
  errorMessage: string | null;
  lyrics: Array<{ title: string; text: string }> | null;
  tracks: MusicGenerationTrackDto[];
  albumCoverImages: string[];
  selectedAlbumCoverUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MusicGenerateResponseDto {
  recordId: string;
  provider: string;
  taskId: string;
  status: string;
}

export interface MusicLyricsGenerateResponseDto {
  provider: string;
  taskId: string;
  status: MusicGenerationRecordStatus;
  lyricsDurationSec?: number;
}

export interface MusicLyricsStatusResponseDto {
  taskId: string;
  status: MusicGenerationRecordStatus;
  provider: string;
  rawStatus?: string;
  lyrics?: Array<{ title: string; text: string }>;
  errorMessage?: string;
  lyricsDurationSec?: number;
}

export type MusicQueuePhase = "queued" | "submitted" | "processing" | "completed" | "failed";

/** Provider-neutral UX progress hint (computed, not persisted). */
export type MusicGenerationPhaseHint =
  | "queued"
  | "generating"
  | "finalizing"
  | "persisting"
  | "ready";

export interface MusicStatusResponseDto {
  recordId: string | null;
  taskId: string;
  status: MusicGenerationRecordStatus;
  provider: string;
  /** Opaque provider/diagnostic status — not for UX progress. */
  rawStatus?: string;
  queuePhase?: MusicQueuePhase;
  queueEtaSec?: number;
  phaseHint?: MusicGenerationPhaseHint;
  /** Derived from status + track.persistenceState — not a separate FSM. */
  audioPersistence?: MusicTrackAudioPersistence;
  tracks?: Array<{
    id: string;
    providerTrackId?: string;
    canDelete?: boolean;
    title: string;
    audioUrl: string;
    imageUrl?: string;
    durationSec?: number;
    lyricsText?: string;
    persistenceState?: MusicTrackPersistenceState;
    playbackAvailable?: boolean;
    audioStatus?: MusicTrackAudioStatus;
  }>;
  lyrics?: Array<{ title: string; text: string }>;
  errorMessage?: string;
  albumCoverImages?: string[];
  selectedAlbumCoverUrl?: string | null;
}


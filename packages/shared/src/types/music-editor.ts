export type SongEditorStatus = "pending_stems" | "separating_stems" | "ready" | "failed";

/** Stem lifecycle for editor UX — distinct from master audio availability. */
export type StemSeparationPhase =
  | "absent"
  | "processing"
  | "ready"
  | "failed"
  | "unavailable";

export type SongStemType = "vocal" | "instrumental";

export type SongRegionLabel = "intro" | "verse" | "chorus" | "bridge" | "outro" | "custom";

export type EditorTrackId = "vocal" | "instrumental";

export interface SetVolumeOperation {
  type: "SET_VOLUME";
  trackId: EditorTrackId;
  regionId: string;
  gainDb: number;
}

export interface MuteTrackOperation {
  type: "MUTE_TRACK";
  trackId: EditorTrackId;
  muted: boolean;
  /** Legacy region-scoped mute; ignored — mute applies to the whole track. */
  regionId?: string;
}

export interface SoloTrackOperation {
  type: "SOLO_TRACK";
  trackId: EditorTrackId;
  regionId: string;
  solo: boolean;
}

export interface DeleteRegionOperation {
  type: "DELETE_REGION";
  regionId: string;
}

export interface DeleteRangeOperation {
  type: "DELETE_RANGE";
  regionId: string;
  startMs: number;
  endMs: number;
}

/** @deprecated Renamed to DeleteRegionOperation. */
export type CutRegionOperation = DeleteRegionOperation;

export interface SplitRegionOperation {
  type: "SPLIT_REGION";
  regionId: string;
  splitAtMs: number;
}

export interface MoveRegionOperation {
  type: "MOVE_REGION";
  regionId: string;
  targetIndex: number;
}

export interface MoveTrackRegionOperation {
  type: "MOVE_TRACK_REGION";
  trackId: EditorTrackId;
  regionId: string;
  targetIndex: number;
}

export interface DuplicateRegionOperation {
  type: "DUPLICATE_REGION";
  regionId: string;
}

export interface ResizeRegionOperation {
  type: "RESIZE_REGION";
  regionId: string;
  startMs: number;
  endMs: number;
}

export interface ResizeTrackRegionOperation {
  type: "RESIZE_TRACK_REGION";
  trackId: EditorTrackId;
  regionId: string;
  startMs: number;
  endMs: number;
}

export interface FadeOperation {
  type: "FADE";
  trackId: EditorTrackId;
  regionId: string;
  fadeType: "in" | "out";
  durationMs: number;
  /** Source ms bounds for partial fade. Defaults to full region. */
  rangeStartMs?: number;
  rangeEndMs?: number;
}

import type { VoicePresetSelection } from "../constants/voice-presets.js";

export interface ApplyVoicePresetOperation {
  type: "APPLY_VOICE_PRESET";
  trackId: "vocal";
  presetId: VoicePresetSelection;
}

export type EditOperation =
  | SetVolumeOperation
  | MuteTrackOperation
  | SoloTrackOperation
  | DeleteRegionOperation
  | DeleteRangeOperation
  | SplitRegionOperation
  | MoveRegionOperation
  | MoveTrackRegionOperation
  | DuplicateRegionOperation
  | ResizeRegionOperation
  | ResizeTrackRegionOperation
  | FadeOperation
  | ApplyVoicePresetOperation;

export interface SongStemDto {
  id: string;
  type: SongStemType;
  audioUrl: string;
  durationMs: number | null;
}

export interface SongRegionDto {
  id: string;
  label: SongRegionLabel;
  startMs: number;
  endMs: number;
  orderIndex: number;
}

export interface SongVersionDto {
  id: string;
  versionNumber: number;
  status: string;
  renderedAudioUrl: string | null;
  createdAt: string;
}

export interface SongDto {
  id: string;
  title: string;
  prompt: string;
  status: SongEditorStatus;
  /** Persisted song/generation provider for post-processing affinity. */
  musicProvider: string;
  durationMs: number | null;
  audioUrl: string | null;
  sourceTrackId: string;
  sourceLyricsText: string | null;
  stemSeparationNotice?: string | null;
  /** True when vocal+instrumental stems are persisted. */
  stemsReady: boolean;
  stemSeparationPhase: StemSeparationPhase;
  /** Paid Suno vocal-removal available for this source asset. */
  stemSeparationAvailable: boolean;
  stemSeparationCostCredits: number;
  createdAt: string;
  updatedAt: string;
}

export interface AudioTrackDto {
  id: EditorTrackId;
  label: string;
  stemId: string | null;
  audioUrl: string | null;
  muted: boolean;
  gainDb: number;
}

export interface EditorStateDto {
  song: SongDto;
  stems: SongStemDto[];
  regions: SongRegionDto[];
  tracks: AudioTrackDto[];
  operations: EditOperation[];
  undoneOperations: EditOperation[];
  currentVersionId: string;
  versions: SongVersionDto[];
}

export interface ApplyOperationBody {
  operation: EditOperation;
  selectedRegionId?: string | null;
  selectedTrackId?: EditorTrackId | null;
}

export type PreviewOperationBody = ApplyOperationBody;

export interface RenderSongResponse {
  renderJobId: string;
  songVersionId: string;
  status: string;
}

export interface ExportWavResponseDto {
  wavAudioUrl: string;
  versionId: string;
  versionNumber: number;
  cached: boolean;
}

export interface ExportWavBody {
  versionId?: string;
}

export interface InitEditorResponse {
  songId: string;
  status: SongEditorStatus;
}

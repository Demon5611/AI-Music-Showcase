export type GenerationStatus =
  | "pending"
  | "preprocessing_voice"
  | "generating_lyrics"
  | "generating_song"
  | "converting_voice"
  | "uploading_result"
  | "completed"
  | "failed";

export type VoiceSampleStatus = "pending" | "ready" | "failed" | "audio_purged";

export type VoiceCloneStatus =
  | "pending"
  | "preparing"
  | "awaiting_verification"
  | "cloning"
  | "ready"
  | "failed";

export type CreditTransactionType = "purchase" | "spend" | "refund";

import type { VocalGender } from "../constants/vocal-gender.js";
import type { PlanId } from "../constants/plans.js";
import type { VoiceProfileStatus } from "../constants/mureka-flags.js";
import type { ResolvedEntitlements } from "../entitlements/index.js";
import type { VoiceLanguage } from "../voice-language/voice-language.js";

export type { VocalGender, VoiceLanguage };

export interface User {
  id: string;
  email: string;
  name: string | null;
  vocalGender: VocalGender | null;
  accountDeletionStatus: string;
  createdAt: string;
  updatedAt: string;
}

/** Public API shape — без storage keys и Suno task/persona IDs. */
export interface VoiceSample {
  id: string;
  userId: string;
  durationSec: number;
  status: VoiceSampleStatus;
  consentConfirmed: boolean;
  /** Language for consent + Suno validation phrase (Suno validate allowlist). */
  voiceLanguage: VoiceLanguage;
  sunoValidatePhrase: string | null;
  voiceCloneStatus: VoiceCloneStatus;
  voiceCloneError: string | null;
  /** ISO-время старта текущей подготовки/фразы верификации — якорь для countdown TTL. */
  voiceCloneStartedAt: string | null;
  /** true только после live check-voice(voice_id) — см. persona-voice-id.service.ts */
  readyForMusicGeneration: boolean;
  createdAt: string;
}

export interface VoiceProfileDto {
  id: string;
  status: VoiceProfileStatus;
  provider: string;
  /** Sample that produced this profile — UI must ignore profiles for other samples. */
  sourceVoiceSampleId: string | null;
  /**
   * True only when a refund ledger row exists for this profile.
   * Never infer refund from `status=failed` alone.
   */
  refundConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Track {
  id: string;
  userId: string;
  title: string;
  prompt: string;
  style: string;
  durationSec: number;
  audioR2Key: string;
  coverR2Key: string | null;
  shareSlug: string;
  createdAt: string;
}

export interface GenerationJob {
  id: string;
  userId: string;
  voiceSampleId: string;
  trackId: string | null;
  prompt: string;
  style: string;
  durationSec: number;
  status: GenerationStatus;
  errorMessage: string | null;
  providerJobId: string | null;
  creditsCost: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  type: CreditTransactionType;
  amountUnits: number;
  reason: string;
  idempotencyKey: string | null;
  createdAt: string;
}

export interface CreditsBalance {
  balance: number;
}

export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing";

/** Entitlements + credit balance for the signed-in user (not a payment subscription). */
export interface SubscriptionDto {
  planId: PlanId;
  planLabel: string;
  status: SubscriptionStatus;
  entitlements: ResolvedEntitlements;
  creditsBalance: number;
  /** true when API applies BILLING_DEV_PLAN_OVERRIDE (non-production only) */
  devPlanOverride?: boolean;
}

export interface GenerationJobPayload {
  jobId: string;
  userId: string;
  voiceSampleId: string;
}

export type {
  KitsInferenceJob,
  KitsJobStatus,
  KitsPaginationMeta,
  KitsStemFileUrl,
  KitsVocalSeparationJob,
  KitsVoiceModel,
  KitsVoiceModelsResponse,
} from "./kits.js";

export type {
  MusicGenerationPhaseHint,
  MusicGenerationRecordDto,
  MusicGenerationRecordStatus,
  MusicGenerationTrackDto,
  MusicGenerationType,
  MusicGenerateResponseDto,
  MusicLyricsGenerateResponseDto,
  MusicLyricsStatusResponseDto,
  MusicQueuePhase,
  MusicStatusResponseDto,
  MusicTrackPersistenceState,
  MusicTrackAudioPersistence,
  MusicTrackAudioStatus,
} from "./music-generation.js";

export type { AlbumCoverResponseDto } from "./album-cover.js";

export type {
  TimedLyricsDisplayLine,
  TimedLyricsLine,
  TimedLyricsPayload,
  TimedLyricsResponseDto,
  TimedLyricsWord,
} from "./timed-lyrics.js";

export type {
  ApplyOperationBody,
  AudioTrackDto,
  DeleteRegionOperation,
  DeleteRangeOperation,
  EditOperation,
  EditorStateDto,
  EditorTrackId,
  ExportWavBody,
  ExportWavResponseDto,
  FadeOperation,
  InitEditorResponse,
  PreviewOperationBody,
  RenderSongResponse,
  SetVolumeOperation,
  SongDto,
  SongEditorStatus,
  SongRegionDto,
  SongRegionLabel,
  SongStemDto,
  SongStemType,
  SongVersionDto,
  StemSeparationPhase,
} from "./music-editor.js";

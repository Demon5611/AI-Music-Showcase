export const PROVIDER_JOB_QUEUE_NAME = "provider-jobs";

export type ProviderJobType =
  | "music_generate"
  | "stem_separation"
  | "lyrics_generate";

export interface MusicGenerateJobPayload {
  type: "music_generate";
  userId: string;
  recordId: string;
  songInputJson: string;
  spendReason: string;
  /** Task id accepted by Suno but not yet persisted to DB — persist-only on retry. */
  recoveredProviderTaskId?: string;
  /** HTTP x-request-id when enqueued from API. */
  requestId?: string;
}

export interface StemSeparationJobPayload {
  type: "stem_separation";
  userId: string;
  songId: string;
  spendReason: string;
  requestId?: string;
}

export interface LyricsGenerateJobPayload {
  type: "lyrics_generate";
  userId: string;
  recordId: string;
  prompt: string;
  spendReason: string;
  requestId?: string;
}

export type ProviderJobPayload =
  | MusicGenerateJobPayload
  | StemSeparationJobPayload
  | LyricsGenerateJobPayload;

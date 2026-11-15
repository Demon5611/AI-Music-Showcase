import { createBullMqJobId } from "./bullmq-job-id.js";

export const AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME = "audioengine-provider-jobs";

export type AudioengineProviderJobType =
  | "audioengine_music_generate"
  | "audioengine_music_poll"
  | "audioengine_vocal_clone";

export interface AudioengineMusicGenerateJobPayload {
  type: "audioengine_music_generate";
  userId: string;
  recordId: string;
  songInputJson: string;
  spendReason: string;
  recoveredProviderTaskId?: string;
  requestId?: string;
}

export interface AudioengineMusicPollJobPayload {
  type: "audioengine_music_poll";
  userId: string;
  recordId: string;
  providerTaskId: string;
  /** Wall-clock when generation was accepted by provider (ms). */
  submittedAtMs: number;
  /** Poll attempt counter (1-based). */
  attempt: number;
  requestId?: string;
}

export interface AudioengineVocalCloneJobPayload {
  type: "audioengine_vocal_clone";
  userId: string;
  voiceProfileId: string;
  voiceSampleId: string;
  spendReason: string;
  /** Provider accepted clone, but DB persistence needs recovery without another POST. */
  recoveredExternalId?: string;
  requestId?: string;
}

export type AudioengineProviderJobPayload =
  | AudioengineMusicGenerateJobPayload
  | AudioengineMusicPollJobPayload
  | AudioengineVocalCloneJobPayload;

/**
 * Deterministic BullMQ custom jobId for Audioengine jobs.
 * Job `name` stays `payload.type`; only opts.jobId uses these values.
 */
export function audioengineProviderJobId(payload: AudioengineProviderJobPayload): string {
  switch (payload.type) {
    case "audioengine_music_generate":
      return createBullMqJobId("audioengine-music-generate", payload.recordId);
    case "audioengine_music_poll":
      return createBullMqJobId("audioengine-poll", payload.recordId, payload.attempt);
    case "audioengine_vocal_clone":
      return createBullMqJobId("audioengine-vocal-clone", payload.voiceProfileId);
  }
}

/** Poll delay: 5s for first 60s, then 10s. */
export function resolveAudioenginePollDelayMs(submittedAtMs: number, nowMs = Date.now()): number {
  const elapsedMs = Math.max(0, nowMs - submittedAtMs);
  return elapsedMs < 60_000 ? 5_000 : 10_000;
}

export const AUDIOENGINE_POLL_TIMEOUT_MS = 600_000;

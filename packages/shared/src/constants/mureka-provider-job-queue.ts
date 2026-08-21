import { createBullMqJobId } from "./bullmq-job-id.js";

export const MUREKA_PROVIDER_JOB_QUEUE_NAME = "mureka-provider-jobs";

export type MurekaProviderJobType =
  | "mureka_music_generate"
  | "mureka_music_poll"
  | "mureka_vocal_clone";

export interface MurekaMusicGenerateJobPayload {
  type: "mureka_music_generate";
  userId: string;
  recordId: string;
  songInputJson: string;
  spendReason: string;
  recoveredProviderTaskId?: string;
  requestId?: string;
}

export interface MurekaMusicPollJobPayload {
  type: "mureka_music_poll";
  userId: string;
  recordId: string;
  providerTaskId: string;
  /** Wall-clock when generation was accepted by provider (ms). */
  submittedAtMs: number;
  /** Poll attempt counter (1-based). */
  attempt: number;
  requestId?: string;
}

export interface MurekaVocalCloneJobPayload {
  type: "mureka_vocal_clone";
  userId: string;
  voiceProfileId: string;
  voiceSampleId: string;
  spendReason: string;
  /** Provider accepted clone, but DB persistence needs recovery without another POST. */
  recoveredExternalId?: string;
  requestId?: string;
}

export type MurekaProviderJobPayload =
  | MurekaMusicGenerateJobPayload
  | MurekaMusicPollJobPayload
  | MurekaVocalCloneJobPayload;

/**
 * Deterministic BullMQ custom jobId for Mureka jobs.
 * Job `name` stays `payload.type`; only opts.jobId uses these values.
 */
export function murekaProviderJobId(payload: MurekaProviderJobPayload): string {
  switch (payload.type) {
    case "mureka_music_generate":
      return createBullMqJobId("mureka-music-generate", payload.recordId);
    case "mureka_music_poll":
      return createBullMqJobId("mureka-poll", payload.recordId, payload.attempt);
    case "mureka_vocal_clone":
      return createBullMqJobId("mureka-vocal-clone", payload.voiceProfileId);
  }
}

/** Poll delay: 5s for first 60s, then 10s. */
export function resolveMurekaPollDelayMs(submittedAtMs: number, nowMs = Date.now()): number {
  const elapsedMs = Math.max(0, nowMs - submittedAtMs);
  return elapsedMs < 60_000 ? 5_000 : 10_000;
}

export const MUREKA_POLL_TIMEOUT_MS = 600_000;

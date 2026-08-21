import type {
  MusicGenerationPhaseHint,
  MusicQueuePhase,
  MusicTrackAudioPersistence,
  MusicGenerationRecordStatus,
} from "@ai-music/shared";
import type { GenerationStatusResult } from "@ai-music/ai-providers";
import type { MusicGeneration } from "@ai-music/db";
import { estimateProviderQueueWaitSec } from "../queue/provider-queue-metrics.js";

export function resolveMusicQueuePhase(
  record: Pick<MusicGeneration, "providerTaskId" | "status">,
  status: GenerationStatusResult,
): MusicQueuePhase {
  if (status.status === "completed") {
    return "completed";
  }

  if (status.status === "failed" || record.status === "failed") {
    return "failed";
  }

  if (record.providerTaskId.startsWith("queue:")) {
    return "queued";
  }

  if (status.status === "processing") {
    return "processing";
  }

  return "submitted";
}

export function resolveMusicQueueEtaSec(
  queuePhase: MusicQueuePhase,
  waitingJobs: number,
): number | undefined {
  if (queuePhase !== "queued") {
    return undefined;
  }

  return estimateProviderQueueWaitSec(Math.max(waitingJobs, 1));
}

/**
 * Provider-neutral UX phase. Derived at response time — not stored in DB.
 * Does not read vendor rawStatus enums.
 */
export function resolveMusicGenerationPhaseHint(input: {
  status: MusicGenerationRecordStatus;
  queuePhase?: MusicQueuePhase;
  audioPersistence?: MusicTrackAudioPersistence;
  hasStreamProgress?: boolean;
}): MusicGenerationPhaseHint | undefined {
  const { status, queuePhase, audioPersistence, hasStreamProgress } = input;

  if (status === "failed") {
    return undefined;
  }

  if (audioPersistence === "ready") {
    return "ready";
  }

  if (status === "completed" && audioPersistence === "saving") {
    return "persisting";
  }

  if (status === "completed") {
    // Empty / failed persistence stays out of "ready" — UI waits for playable audio.
    return "persisting";
  }

  if (queuePhase === "queued") {
    return "queued";
  }

  if (status === "processing" || queuePhase === "processing") {
    return hasStreamProgress ? "finalizing" : "generating";
  }

  if (queuePhase === "submitted" || status === "pending") {
    return "generating";
  }

  return "generating";
}

import type { VoiceCloneStatus, VoiceSample } from "@ai-music/shared";
import { env } from "@/shared/config/env";
import { isVoiceSampleReadyForGeneration, needsPersonaReverification } from "@/entities/voice-sample";

export const VOICE_CLONE_STATUS_MESSAGE_KEYS = {
  pending: "sample.status.pending",
  preparing: "sample.status.preparing",
  awaiting_verification: "sample.status.awaitingVerification",
  cloning: "sample.status.cloning",
  ready: "sample.status.ready",
  failed: "sample.status.failed",
} as const satisfies Record<VoiceCloneStatus, string>;

export type VoiceSampleStatusMessageKey =
  | (typeof VOICE_CLONE_STATUS_MESSAGE_KEYS)[VoiceCloneStatus]
  | "sample.status.readyForGeneration"
  | "sample.status.needsReverification";

export function buildVoiceSampleAudioUrl(sampleId: string): string {
  return `${env.apiUrl}/api/voice-samples/${sampleId}/audio`;
}

export function formatVoiceSampleDate(createdAt: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

export function formatVoiceSampleDuration(durationSec: number): string {
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function resolveVoiceSampleStatusMessageKey(
  sample: VoiceSample,
): VoiceSampleStatusMessageKey {
  if (isVoiceSampleReadyForGeneration(sample)) {
    return "sample.status.readyForGeneration";
  }

  if (needsPersonaReverification(sample)) {
    return "sample.status.needsReverification";
  }

  return VOICE_CLONE_STATUS_MESSAGE_KEYS[sample.voiceCloneStatus];
}

export function pickLatestReadyVoiceSampleId(samples: VoiceSample[]): string | null {
  const readySample = samples.find(isVoiceSampleReadyForGeneration);
  return readySample?.id ?? null;
}

export function pickDefaultVoiceSampleId(
  samples: VoiceSample[],
  _storedId: string | null,
): string | null {
  return pickLatestReadyVoiceSampleId(samples);
}

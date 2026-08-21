import type { VoiceSample } from "@ai-music/shared";

export type { VoiceSample };

export function isVoiceSampleReady(sample: VoiceSample): boolean {
  return sample.consentConfirmed && sample.status === "ready";
}

export function isVoiceSampleReadyForGeneration(
  sample: VoiceSample,
): boolean {
  if (sample.readyForMusicGeneration !== undefined) {
    return sample.readyForMusicGeneration;
  }

  return isVoiceSampleReady(sample) && sample.voiceCloneStatus === "ready";
}

const VOICE_CLONE_CANCELLED_MESSAGE =
  "Процесс остановлен. Нажмите «Повторить верификацию», чтобы начать заново.";

/** User stopped verification — do not resume Suno sync/polling. */
export function isVoiceCloneCancelled(sample: VoiceSample): boolean {
  return sample.voiceCloneError === VOICE_CLONE_CANCELLED_MESSAGE;
}

/** Suno clone marked ready, but live check-voice(voice_id) failed — need /consent restart. */
export function needsPersonaReverification(sample: VoiceSample): boolean {
  return sample.voiceCloneStatus === "ready" && sample.readyForMusicGeneration === false;
}

export { resolveVoiceSampleSnapshot, shouldHoldVoiceVerifyTransition } from "./resolve-voice-sample-snapshot";

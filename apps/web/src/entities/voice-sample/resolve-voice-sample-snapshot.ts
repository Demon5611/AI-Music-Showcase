import type { VoiceCloneStatus, VoiceSample } from "@ai-music/shared";

const VOICE_CLONE_PROGRESS_RANK: Record<VoiceCloneStatus, number> = {
  pending: 0,
  preparing: 1,
  awaiting_verification: 2,
  cloning: 3,
  ready: 4,
  failed: -1,
};

function rankVoiceCloneStatus(status: VoiceCloneStatus): number {
  return VOICE_CLONE_PROGRESS_RANK[status];
}

/** Prefer the furthest-along clone state; never regress (e.g. cloning → awaiting). */
export function resolveVoiceSampleSnapshot(
  querySample: VoiceSample | undefined,
  localSample: VoiceSample | null,
): VoiceSample | null {
  if (!querySample) {
    return localSample;
  }

  if (!localSample) {
    return querySample;
  }

  if (querySample.id !== localSample.id) {
    return querySample;
  }

  if (localSample.voiceCloneStatus === "failed") {
    return localSample;
  }

  if (querySample.voiceCloneStatus === "failed") {
    return querySample;
  }

  const queryRank = rankVoiceCloneStatus(querySample.voiceCloneStatus);
  const localRank = rankVoiceCloneStatus(localSample.voiceCloneStatus);

  if (localRank === queryRank) {
    return querySample;
  }

  return localRank > queryRank ? localSample : querySample;
}

/** True when UI must keep loader / hide recorder after verify submit. */
export function shouldHoldVoiceVerifyTransition(
  verificationSubmitted: boolean,
  status: VoiceCloneStatus | undefined,
): boolean {
  if (!verificationSubmitted || !status) {
    return false;
  }

  return status === "awaiting_verification" || status === "cloning" || status === "preparing";
}

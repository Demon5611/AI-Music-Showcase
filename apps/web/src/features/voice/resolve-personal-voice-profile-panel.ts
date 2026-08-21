import type { VoiceProfileDto, VoiceProfileStatus } from "@ai-music/shared";

/**
 * A failed profile for sample A must not block or decorate sample B.
 * When multiple local candidates exist, ready wins over failed.
 */
export function resolveProfileForSample(
  profile: VoiceProfileDto | null | undefined,
  sampleId: string,
): VoiceProfileDto | null {
  if (!profile) {
    return null;
  }

  if (profile.sourceVoiceSampleId !== sampleId) {
    return null;
  }

  return profile;
}

/**
 * Prefer ready profile for a sample when several DTOs are available locally.
 * Backend `GET /voice-profiles/me` already prefers ready; this guards UI tests.
 */
export function preferReadyProfileForSample(
  profiles: readonly VoiceProfileDto[],
  sampleId: string,
): VoiceProfileDto | null {
  const matching = profiles.filter(
    (profile) => profile.sourceVoiceSampleId === sampleId,
  );
  const ready = matching.find((profile) => profile.status === "ready");
  if (ready) {
    return ready;
  }
  return matching[0] ?? null;
}

export type PersonalVoicePanelPresentation = {
  status: VoiceProfileStatus | null;
  showFailedBanner: boolean;
  showRefundConfirmed: boolean;
  showCreateCta: boolean;
  createCtaMode: "create" | "retry" | null;
};

/**
 * Voice creation panel presentation.
 * Account/provider deletion lives in Profile — never mix deletion copy here.
 * Disable ("My voice" off) is generate-time only and does not change profile status.
 */
export function resolvePersonalVoicePanelPresentation(input: {
  profile: VoiceProfileDto | null;
  blockedReason: string | null | undefined;
}): PersonalVoicePanelPresentation {
  const status = input.profile?.status ?? null;
  const blocked = Boolean(input.blockedReason);
  const isFailed = status === "failed";
  const isReady = status === "ready";
  const isCreating = status === "creating";
  const inDeletionFlow =
    status === "deletion_requested" ||
    status === "deleted_locally" ||
    status === "provider_deletion_pending" ||
    status === "provider_deleted";

  // Deletion lifecycle is owned by account deletion UI — hide create/retry noise.
  if (inDeletionFlow) {
    return {
      status,
      showFailedBanner: false,
      showRefundConfirmed: false,
      showCreateCta: false,
      createCtaMode: null,
    };
  }

  return {
    status,
    showFailedBanner: isFailed,
    showRefundConfirmed: isFailed && input.profile?.refundConfirmed === true,
    showCreateCta: !blocked && !isReady && !isCreating,
    createCtaMode: !blocked && !isReady && !isCreating ? (isFailed ? "retry" : "create") : null,
  };
}

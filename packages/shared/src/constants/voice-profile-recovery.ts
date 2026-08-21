import { hasRealProviderExternalId } from "./voice-deletion.js";

export const ERRONEOUS_LEGACY_VOICE_DELETION_RECOVERY_REASON =
  "erroneous_legacy_self_service_voice_deletion" as const;

export type VoiceProfileRecoveryEligibilityInput = {
  profile: {
    id: string;
    userId: string;
    status: string;
    deletedAt: Date | string | null;
    externalId: string;
  };
  deletionRequest: {
    id: string;
    userId: string;
    resourceId: string;
    status: string;
    submittedAt: Date | string | null;
    confirmedAt: Date | string | null;
  };
  account: {
    accountDeletionStatus: string;
    hasActiveAccountDeletionRequest: boolean;
  };
  expected: {
    profileId: string;
    userId: string;
    deletionRequestId: string;
  };
};

export type VoiceProfileRecoveryDecision =
  | { eligible: true }
  | { eligible: false; reason: string };

/**
 * Fail-closed eligibility for restoring a VoiceProfile after an erroneous
 * local-only provider deletion request (never submitted to Mureka).
 */
export function evaluateVoiceProfileRecoveryEligibility(
  input: VoiceProfileRecoveryEligibilityInput,
): VoiceProfileRecoveryDecision {
  const { profile, deletionRequest, account, expected } = input;

  if (profile.id !== expected.profileId) {
    return { eligible: false, reason: "profile_id_mismatch" };
  }

  if (profile.userId !== expected.userId) {
    return { eligible: false, reason: "profile_user_mismatch" };
  }

  if (deletionRequest.id !== expected.deletionRequestId) {
    return { eligible: false, reason: "deletion_request_id_mismatch" };
  }

  if (deletionRequest.userId !== expected.userId) {
    return { eligible: false, reason: "deletion_request_user_mismatch" };
  }

  if (deletionRequest.resourceId !== expected.profileId) {
    return { eligible: false, reason: "deletion_request_resource_mismatch" };
  }

  if (!hasRealProviderExternalId(profile.externalId)) {
    return { eligible: false, reason: "missing_real_external_id" };
  }

  if (profile.status !== "deleted_locally") {
    return { eligible: false, reason: "profile_status_not_deleted_locally" };
  }

  if (!profile.deletedAt) {
    return { eligible: false, reason: "profile_deleted_at_missing" };
  }

  if (deletionRequest.status !== "pending") {
    return { eligible: false, reason: "deletion_request_not_pending" };
  }

  if (deletionRequest.submittedAt) {
    return { eligible: false, reason: "deletion_request_already_submitted" };
  }

  if (deletionRequest.confirmedAt) {
    return { eligible: false, reason: "deletion_request_already_confirmed" };
  }

  if (account.accountDeletionStatus !== "active") {
    return { eligible: false, reason: "account_deletion_not_active" };
  }

  if (account.hasActiveAccountDeletionRequest) {
    return { eligible: false, reason: "active_account_deletion_request" };
  }

  return { eligible: true };
}

export function buildVoiceProfileRecoveryMetadata(input: {
  previous: Record<string, unknown> | null | undefined;
  recoveredProfileId: string;
  recoveredAt?: Date;
}): Record<string, unknown> {
  return {
    ...(input.previous ?? {}),
    recoveryReason: ERRONEOUS_LEGACY_VOICE_DELETION_RECOVERY_REASON,
    recoveredAt: (input.recoveredAt ?? new Date()).toISOString(),
    recoveredProfileId: input.recoveredProfileId,
  };
}

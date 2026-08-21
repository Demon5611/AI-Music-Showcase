import { VOICE_PROFILE_UNUSABLE_STATUSES } from "./mureka-flags.js";

/**
 * Semantic mapping (docs / legal — DB values unchanged):
 * - ready / creating / failed → pre-deletion lifecycle
 * - deletion_requested → user requested disable
 * - deleted_locally → local source audio purged
 * - provider_deletion_pending → deletion email submitted (or ops mark-submitted)
 * - provider_deleted → terminal after ops confirmation
 */

export type VoiceDeletionScope = {
  vocalId: boolean;
  sourceVoiceSample: boolean;
  derivedVoiceEmbeddings: boolean;
  derivedModelData: boolean;
  otherAssociatedVoiceData: boolean;
};

export const DEFAULT_MUREKA_VOICE_DELETION_SCOPE: VoiceDeletionScope = {
  vocalId: true,
  sourceVoiceSample: true,
  derivedVoiceEmbeddings: true,
  derivedModelData: true,
  otherAssociatedVoiceData: true,
};

export const VOICE_DELETION_TERMINAL_PROFILE_STATUS = "provider_deleted" as const;

/** Blocks account finalization / duplicate request create until confirmed. */
export const VOICE_DELETION_ACTIVE_REQUEST_STATUSES = [
  "pending",
  "submitting",
  "submitted_to_provider",
  "submit_failed",
] as const;

const DELETION_FLOW_PROFILE_STATUSES = [
  "deletion_requested",
  "deleted_locally",
  "provider_deletion_pending",
  "provider_deleted",
] as const;

export function resolveMurekaVoiceDeletionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.MUREKA_VOICE_DELETION_ENABLED?.trim() === "true";
}

export function hasRealProviderExternalId(externalId: string): boolean {
  const trimmed = externalId.trim();
  return Boolean(trimmed) && !trimmed.startsWith("pending:");
}

export function isVoiceProfileInDeletionFlow(status: string): boolean {
  return (DELETION_FLOW_PROFILE_STATUSES as readonly string[]).includes(status);
}

export function isVoiceProfileBlockedForProviderUse(input: {
  status: string;
  deletedAt: Date | null;
}): boolean {
  if (input.deletedAt) {
    return true;
  }

  return (VOICE_PROFILE_UNUSABLE_STATUSES as readonly string[]).includes(input.status);
}

export function isProviderDeletionRequestTerminal(status: string): boolean {
  return status === "confirmed" || status === "failed" || status === "cancelled";
}

export function canMarkProviderDeletionSubmitted(status: string): boolean {
  return (
    status === "pending" ||
    status === "submitting" ||
    status === "submit_failed" ||
    status === "submitted_to_provider"
  );
}

/** Open ops queue / gauges — cancelled is never open. */
export function isProviderDeletionRequestOpen(status: string): boolean {
  return (VOICE_DELETION_ACTIVE_REQUEST_STATUSES as readonly string[]).includes(
    status,
  );
}

export function buildProviderDeletionRequestMetadata(input: {
  deletionScope: VoiceDeletionScope;
  providerMode: "manual" | "api";
  requiresOperatorAction: boolean;
  note?: string;
}): Record<string, unknown> {
  return {
    deletionScope: input.deletionScope,
    providerMode: input.providerMode,
    requiresOperatorAction: input.requiresOperatorAction,
    note:
      input.note ??
      "Manual voice-processing provider deletion required; no public delete API",
  };
}

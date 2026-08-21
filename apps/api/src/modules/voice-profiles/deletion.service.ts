/**
 * VoiceProfile deletion + ProviderDataDeletionRequest ops.
 * Provider delete is abstracted via VoiceProvider — no fake HTTP delete.
 */
import { createVoiceProvider } from "@ai-music/ai-providers";
import {
  voiceDeletionConfirmedTotal,
  voiceDeletionLocalPurgeCompletedTotal,
  voiceDeletionPendingProviderTotal,
  voiceDeletionRequestedTotal,
} from "@ai-music/observability";
import { prisma, type Prisma, type VoiceProfile } from "@ai-music/db";
import {
  buildMurekaVoiceProfileRefundKey,
  buildMurekaVoiceProfileSpendKey,
  buildProviderDeletionRequestMetadata,
  DEFAULT_MUREKA_VOICE_DELETION_SCOPE,
  hasRealProviderExternalId,
  canMarkProviderDeletionSubmitted,
  isProviderDeletionRequestTerminal,
  isVoiceProfileInDeletionFlow,
  logLoadControl,
  VOICE_DELETION_ACTIVE_REQUEST_STATUSES,
  VOICE_DELETION_TERMINAL_PROFILE_STATUS,
  VOICE_PROFILE_ACTIVE_STATUSES,
  VOICE_PROFILE_USER_VISIBLE_STATUSES,
} from "@ai-music/shared";
import { BadRequestError, NotFoundError } from "../../common/errors.js";
import { refundOriginalSpend } from "../credits/service.js";
import {
  removeMurekaVocalCloneJobIfQueued,
} from "../queue/mureka-provider-job-queue.js";
import { enqueueProviderDataDeletionSubmitJob } from "../queue/provider-data-deletion-queue.js";
import { getStorageService } from "../storage/storage.service.js";
import { toVoiceProfileDto, type VoiceProfileDeletionResponse } from "./mapper.js";

const RESOURCE_TYPE = "voice_profile";

export type RequestVoiceProfileDeletionOptions = {
  /** Account/system deletion bypasses self-service feature flag. */
  systemTriggered?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeMetadata(
  current: unknown,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue {
  const base = isRecord(current) ? current : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
}

function assertSelfServiceDeletionEnabled(
  options?: RequestVoiceProfileDeletionOptions,
): void {
  if (options?.systemTriggered) {
    return;
  }

  // Product contract: provider voice deletion only via Account Deletion.
  // Standalone Profile "delete voice" is retired (disable ≠ delete).
  throw new BadRequestError(
    "Personal voice deletion is only available via account deletion",
    "VOICE_DELETION_VIA_ACCOUNT_ONLY",
  );
}

async function purgeSourceSampleAudio(
  userId: string,
  sourceVoiceSampleId: string,
): Promise<{ purged: boolean }> {
  const sample = await prisma.voiceSample.findFirst({
    where: { id: sourceVoiceSampleId, userId },
  });

  if (!sample || sample.r2Key === "pending" || sample.r2Key === "purged") {
    return { purged: false };
  }

  const storage = getStorageService();
  await storage.deleteObject(sample.r2Key).catch(() => undefined);

  await prisma.voiceSample.update({
    where: { id: sample.id },
    data: {
      r2Key: "purged",
      status: "audio_purged",
    },
  });

  return { purged: true };
}

/**
 * Request personal voice deletion (soft-delete + local purge + provider request).
 * Not the same as turning off "My voice" in Music Create.
 */
export async function requestVoiceProfileDeletion(
  userId: string,
  voiceProfileId: string,
  options?: RequestVoiceProfileDeletionOptions,
): Promise<VoiceProfileDeletionResponse> {
  assertSelfServiceDeletionEnabled(options);

  const profile = await prisma.voiceProfile.findFirst({
    where: { id: voiceProfileId, userId },
  });

  if (!profile) {
    throw new NotFoundError("Voice profile not found");
  }

  if (isVoiceProfileInDeletionFlow(profile.status)) {
    return {
      profile: await toVoiceProfileDto(profile),
      messageCode: "deletion_registered",
    };
  }

  if (
    profile.status !== "ready" &&
    profile.status !== "failed" &&
    profile.status !== "creating"
  ) {
    throw new BadRequestError(
      "Voice profile cannot be deleted in the current state",
      "VOICE_PROFILE_DELETE_INVALID_STATE",
    );
  }

  return executeVoiceProfileDeletion(userId, profile, options);
}

async function executeVoiceProfileDeletion(
  userId: string,
  profile: VoiceProfile,
  options?: RequestVoiceProfileDeletionOptions,
): Promise<VoiceProfileDeletionResponse> {
  const now = new Date();
  const deletionScope = DEFAULT_MUREKA_VOICE_DELETION_SCOPE;
  const hasExternalId = hasRealProviderExternalId(profile.externalId);

  let createdDeletionRequestId: string | null = null;

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.voiceProfile.update({
      where: { id: profile.id },
      data: {
        status: "deletion_requested",
        deletedAt: now,
        metadata: mergeMetadata(profile.metadata, {
          deletionRequestedAt: now.toISOString(),
          providerDeletionStatus: "pending",
        }),
      },
    });

    if (hasExternalId) {
      const existingRequest = await tx.providerDataDeletionRequest.findFirst({
        where: {
          userId,
          provider: profile.provider,
          resourceType: RESOURCE_TYPE,
          resourceId: profile.id,
          status: { in: [...VOICE_DELETION_ACTIVE_REQUEST_STATUSES] },
        },
      });

      if (!existingRequest) {
        const voiceProvider = createVoiceProvider(profile.provider);
        const providerResult = voiceProvider?.requestVoiceProfileDeletion
          ? await voiceProvider.requestVoiceProfileDeletion({
              provider: profile.provider,
              externalId: profile.externalId,
              voiceProfileId: profile.id,
              deletionScope,
            })
          : null;

        if (providerResult) {
          const created = await tx.providerDataDeletionRequest.create({
            data: {
              userId,
              provider: profile.provider,
              resourceType: RESOURCE_TYPE,
              resourceId: profile.id,
              providerExternalId: providerResult.externalId,
              status: "pending",
              requestedAt: now,
              metadata: buildProviderDeletionRequestMetadata({
                deletionScope,
                providerMode: providerResult.mode,
                requiresOperatorAction: providerResult.requiresOperatorAction,
              }) as Prisma.InputJsonValue,
            },
          });
          createdDeletionRequestId = created.id;
        }
      }
    }

    return next;
  });

  if (hasExternalId) {
    voiceDeletionPendingProviderTotal.inc({ provider: profile.provider });
  }

  if (createdDeletionRequestId && profile.provider === "mureka") {
    await enqueueProviderDataDeletionSubmitJob({
      requestId: createdDeletionRequestId,
      provider: profile.provider,
    }).catch((error) => {
      logLoadControl(
        "provider_data_deletion_submit_enqueue",
        {
          phase: "enqueue",
          outcome: "enqueue_failed",
          requestId: createdDeletionRequestId,
          provider: profile.provider,
          error: error instanceof Error ? error.message : "enqueue_failed",
        },
        "error",
      );
    });
  }

  await removeMurekaVocalCloneJobIfQueued(profile.id).catch(() => undefined);

  const purge = await purgeSourceSampleAudio(userId, profile.sourceVoiceSampleId);

  let finalProfile: VoiceProfile = updated;
  if (purge.purged) {
    finalProfile = await prisma.voiceProfile.update({
      where: { id: profile.id },
      data: {
        status: "deleted_locally",
        metadata: mergeMetadata(updated.metadata, {
          localAudioPurgedAt: new Date().toISOString(),
        }),
      },
    });
    voiceDeletionLocalPurgeCompletedTotal.inc({ provider: profile.provider });
  }

  if (profile.status === "creating") {
    await refundOriginalSpend({
      userId,
      spendIdempotencyKey: buildMurekaVoiceProfileSpendKey(profile.id),
      refundIdempotencyKey: buildMurekaVoiceProfileRefundKey(profile.id),
      reason: "mureka_voice_profile_refund",
      relatedEntityType: "voice_profile",
      relatedEntityId: profile.id,
    });
  }

  voiceDeletionRequestedTotal.inc({ provider: profile.provider });

  logLoadControl("voice_profile_deletion_requested", {
    provider: profile.provider,
    voiceProfileId: profile.id,
    userId,
    systemTriggered: options?.systemTriggered === true,
    hasProviderExternalId: hasExternalId,
    localAudioPurged: purge.purged,
  });

  return {
    profile: await toVoiceProfileDto(finalProfile),
    messageCode: "deletion_registered",
  };
}

/**
 * Idempotent account-level enqueue for all non-terminal voice profiles.
 */
export async function requestDeletionForAllUserVoiceProfiles(
  userId: string,
): Promise<{ processed: number; skipped: number }> {
  const profiles = await prisma.voiceProfile.findMany({
    where: {
      userId,
      status: { not: VOICE_DELETION_TERMINAL_PROFILE_STATUS },
    },
    orderBy: { createdAt: "asc" },
  });

  let processed = 0;
  let skipped = 0;

  for (const profile of profiles) {
    if (isVoiceProfileInDeletionFlow(profile.status)) {
      skipped += 1;
      continue;
    }

    if (
      profile.status !== "ready" &&
      profile.status !== "failed" &&
      profile.status !== "creating"
    ) {
      skipped += 1;
      continue;
    }

    await executeVoiceProfileDeletion(userId, profile, { systemTriggered: true });
    processed += 1;
  }

  logLoadControl("voice_profile_account_deletion_enqueued", {
    userId,
    processed,
    skipped,
    totalProfiles: profiles.length,
  });

  return { processed, skipped };
}

export async function listPendingProviderDeletionRequests(limit = 100) {
  return prisma.providerDataDeletionRequest.findMany({
    where: {
      status: {
        in: ["pending", "submitting", "submit_failed", "submitted_to_provider"],
      },
    },
    orderBy: { requestedAt: "asc" },
    take: Math.min(Math.max(limit, 1), 500),
    select: {
      id: true,
      userId: true,
      provider: true,
      resourceType: true,
      resourceId: true,
      providerExternalId: true,
      status: true,
      requestedAt: true,
      submittedAt: true,
      confirmedAt: true,
      attemptCount: true,
      lastAttemptAt: true,
      lastError: true,
      providerReference: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function markProviderDeletionSubmitted(requestId: string) {
  const request = await prisma.providerDataDeletionRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new NotFoundError("Deletion request not found");
  }

  if (request.status === "submitted_to_provider" || request.status === "confirmed") {
    return request;
  }

  if (request.status === "cancelled") {
    throw new BadRequestError(
      "Cancelled deletion request cannot be marked submitted",
      "PROVIDER_DELETION_CANCELLED",
    );
  }

  if (isProviderDeletionRequestTerminal(request.status)) {
    throw new BadRequestError(
      "Deletion request is terminal and cannot be marked submitted",
      "PROVIDER_DELETION_TERMINAL",
    );
  }

  if (!canMarkProviderDeletionSubmitted(request.status)) {
    throw new BadRequestError(
      "Deletion request cannot be marked submitted from current status",
      "PROVIDER_DELETION_INVALID_STATUS",
    );
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.providerDataDeletionRequest.updateMany({
      where: {
        id: requestId,
        status: { in: ["pending", "submitting", "submit_failed"] },
      },
      data: {
        status: "submitted_to_provider",
        submittedAt: now,
        lastError: null,
      },
    });

    if (claimed.count === 0) {
      const current = await tx.providerDataDeletionRequest.findUnique({
        where: { id: requestId },
      });
      if (
        current &&
        (current.status === "submitted_to_provider" || current.status === "confirmed")
      ) {
        return current;
      }
      throw new BadRequestError(
        "Deletion request cannot be marked submitted from current status",
        "PROVIDER_DELETION_INVALID_STATUS",
      );
    }

    const next = await tx.providerDataDeletionRequest.findUniqueOrThrow({
      where: { id: requestId },
    });

    await tx.voiceProfile.updateMany({
      where: {
        id: request.resourceId,
        provider: request.provider,
        status: { in: ["deletion_requested", "deleted_locally"] },
      },
      data: {
        status: "provider_deletion_pending",
      },
    });

    return next;
  });

  logLoadControl("provider_deletion_submitted", {
    provider: request.provider,
    deletionRequestId: request.id,
    resourceId: request.resourceId,
  });

  return updated;
}

export async function markProviderDeletionConfirmed(requestId: string) {
  const request = await prisma.providerDataDeletionRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new NotFoundError("Deletion request not found");
  }

  if (request.status === "confirmed") {
    return request;
  }

  if (request.status === "cancelled") {
    throw new BadRequestError(
      "Cancelled deletion request cannot be marked confirmed",
      "PROVIDER_DELETION_CANCELLED",
    );
  }

  if (request.status === "failed") {
    throw new BadRequestError(
      "Failed deletion request cannot be marked confirmed",
      "PROVIDER_DELETION_TERMINAL",
    );
  }

  if (
    request.status !== "pending" &&
    request.status !== "submitting" &&
    request.status !== "submitted_to_provider" &&
    request.status !== "submit_failed"
  ) {
    throw new BadRequestError(
      "Deletion request cannot be marked confirmed from current status",
      "PROVIDER_DELETION_INVALID_STATUS",
    );
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.providerDataDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: "confirmed",
        confirmedAt: now,
      },
    });

    await tx.voiceProfile.updateMany({
      where: {
        id: request.resourceId,
        provider: request.provider,
      },
      data: {
        status: "provider_deleted",
      },
    });

    const profile = await tx.voiceProfile.findUnique({
      where: { id: request.resourceId },
    });
    if (profile) {
      await tx.voiceProfile.update({
        where: { id: profile.id },
        data: {
          metadata: mergeMetadata(profile.metadata, {
            providerDeletionStatus: "confirmed",
            providerDeletedAt: now.toISOString(),
          }),
        },
      });
    }

    return next;
  });

  voiceDeletionConfirmedTotal.inc({ provider: request.provider });

  logLoadControl("provider_deletion_confirmed", {
    provider: request.provider,
    deletionRequestId: request.id,
    resourceId: request.resourceId,
  });

  const { tryFinalizeAccountDeletion } = await import(
    "../account-deletion/account-deletion.service.js"
  );
  await tryFinalizeAccountDeletion(request.userId).catch(() => undefined);

  return updated;
}

export { VOICE_PROFILE_ACTIVE_STATUSES, VOICE_PROFILE_USER_VISIBLE_STATUSES };

import {
  createMurekaVocalCloneProvider,
  MurekaConfigurationError,
  MurekaHttpError,
} from "@ai-music/ai-providers";
import { prisma, refundOriginalSpend, type Prisma } from "@ai-music/db";
import {
  buildMurekaVoiceProfileRefundKey,
  buildMurekaVoiceProfileSpendKey,
  isVoiceProfileBlockedForProviderUse,
  logLoadControl,
  type MurekaProviderJobPayload,
  type MurekaVocalCloneJobPayload,
} from "@ai-music/shared";
import { isStorageNotFoundError } from "@ai-music/storage";
import type { Job } from "bullmq";
import { getWorkerStorageService } from "../common/storage.js";
import { storageErrorCode } from "../common/storage-error-code.js";

export type MurekaVocalCloneOutcome = "success" | "terminal_failed" | "skipped";

/**
 * Classifies a provider-boundary failure.
 * Retryable errors must not mark the VoiceProfile failed or refund — BullMQ retries.
 */
export function classifyVocalCloneProviderError(error: unknown): {
  terminal: boolean;
  kind: string;
  httpStatus: number | null;
  message: string;
  responseInvalid: boolean;
} {
  if (error instanceof MurekaConfigurationError) {
    return {
      terminal: true,
      kind: "configuration",
      httpStatus: null,
      message: error.message,
      responseInvalid: false,
    };
  }

  if (error instanceof MurekaHttpError) {
    const responseInvalid =
      error.message.includes("schema validation") ||
      error.message.includes("not valid JSON") ||
      error.message.includes("missing vocal");

    return {
      terminal: !error.retryable,
      kind: error.kind,
      httpStatus: error.httpStatus ?? null,
      message: error.message,
      responseInvalid,
    };
  }

  return {
    terminal: true,
    kind: "unknown",
    httpStatus: null,
    message: error instanceof Error ? error.message : "Unknown Mureka vocal clone error",
    responseInvalid: false,
  };
}

export async function processMurekaVocalClone(
  payload: MurekaVocalCloneJobPayload,
  job: Job<MurekaProviderJobPayload>,
): Promise<MurekaVocalCloneOutcome> {
  const profile = await prisma.voiceProfile.findUnique({ where: { id: payload.voiceProfileId } });
  if (!profile || profile.userId !== payload.userId || profile.provider !== "mureka") {
    throw new Error("Mureka voice profile not found");
  }
  if (profile.status === "ready") {
    return "success";
  }
  if (isVoiceProfileBlockedForProviderUse(profile)) {
    if (payload.recoveredExternalId) {
      await retainVocalIdForManualDeletion(profile.id, payload.recoveredExternalId);
    }
    logLoadControl(
      "mureka_vocal_clone_skipped_deleted",
      { provider: "mureka", voiceProfileId: profile.id },
      "info",
    );
    return "skipped";
  }
  if (profile.status === "failed") {
    await refundVoiceProfile(payload);
    return "terminal_failed";
  }
  if (profile.status !== "creating" || profile.sourceVoiceSampleId !== payload.voiceSampleId) {
    throw new Error("Mureka voice profile is not eligible for cloning");
  }
  if (payload.recoveredExternalId) {
    await persistReadyProfile(profile.id, payload.recoveredExternalId);
    logReady(payload, 0);
    return "success";
  }

  const sample = await prisma.voiceSample.findUnique({ where: { id: payload.voiceSampleId } });
  if (!sample || sample.userId !== payload.userId) {
    await failVoiceProfile(payload, {
      message: "Source voice sample not found",
      failureCode: "sample_not_found",
      errorKind: "validation",
    });
    return "terminal_failed";
  }

  let source: VocalCloneSource;
  try {
    source = await readVocalCloneSource(sample.r2Key);
  } catch (error) {
    if (isStorageNotFoundError(error)) {
      await failVoiceProfile(payload, {
        message: "Source voice sample is missing in storage",
        failureCode: "sample_storage_missing",
        errorKind: "storage_not_found",
      });
      return "terminal_failed";
    }

    logStorageBoundaryFailure(payload, error);
    throw error;
  }

  logLoadControl("mureka_vocal_clone_sample_loaded", {
    provider: "mureka",
    voiceProfileId: payload.voiceProfileId,
    sampleId: payload.voiceSampleId,
    bytes: source.body.length,
    contentType: source.contentType.split(";")[0]?.trim() ?? null,
  });

  if (!isMurekaMp3Source(source.contentType, sample.r2Key)) {
    await failVoiceProfile(payload, {
      message: "Mureka vocal clone requires a normalized MP3 source",
      failureCode: "sample_not_mp3",
      errorKind: "validation",
      bytes: source.body.length,
    });
    return "terminal_failed";
  }

  const httpStartedAt = Date.now();

  const profileBeforeHttp = await prisma.voiceProfile.findUnique({
    where: { id: payload.voiceProfileId },
  });
  if (
    !profileBeforeHttp ||
    profileBeforeHttp.userId !== payload.userId ||
    profileBeforeHttp.provider !== "mureka" ||
    isVoiceProfileBlockedForProviderUse(profileBeforeHttp)
  ) {
    if (payload.recoveredExternalId) {
      await retainVocalIdForManualDeletion(profile.id, payload.recoveredExternalId);
    }
    logLoadControl(
      "mureka_vocal_clone_skipped_deleted",
      { provider: "mureka", voiceProfileId: profile.id, stage: "pre_http" },
      "info",
    );
    return "skipped";
  }

  logLoadControl("mureka_vocal_clone_http_started", {
    provider: "mureka",
    voiceProfileId: payload.voiceProfileId,
    sampleId: payload.voiceSampleId,
    bytes: source.body.length,
  });

  let vocalId: string;
  try {
    const result = await createMurekaVocalCloneProvider().createVocalClone({
      file: source.body,
      filename: "voice.mp3",
      contentType: "audio/mpeg",
      description: profile.description ?? undefined,
    });
    vocalId = result.vocalId;
  } catch (error) {
    const classified = classifyVocalCloneProviderError(error);
    const durationMs = Date.now() - httpStartedAt;

    if (classified.responseInvalid) {
      logLoadControl(
        "mureka_vocal_clone_response_invalid",
        {
          provider: "mureka",
          voiceProfileId: payload.voiceProfileId,
          sampleId: payload.voiceSampleId,
          httpStatus: classified.httpStatus,
          errorKind: classified.kind,
          durationMs,
          bytes: source.body.length,
        },
        "error",
      );
    } else {
      logLoadControl(
        "mureka_vocal_clone_http_failed",
        {
          provider: "mureka",
          voiceProfileId: payload.voiceProfileId,
          sampleId: payload.voiceSampleId,
          httpStatus: classified.httpStatus,
          errorKind: classified.kind,
          durationMs,
          bytes: source.body.length,
          retryable: !classified.terminal,
        },
        classified.terminal ? "error" : "warn",
      );
    }

    const lastAttempt =
      (job.attemptsMade ?? 0) + 1 >= (job.opts.attempts ?? 1);

    if (!classified.terminal && !lastAttempt) {
      // Keep status=creating; BullMQ will retry. Do not refund yet.
      throw error instanceof Error ? error : new Error(classified.message);
    }

    await failVoiceProfile(payload, {
      message: classified.message,
      failureCode: lastAttempt && !classified.terminal
        ? "provider_retries_exhausted"
        : "provider_terminal",
      errorKind: classified.kind,
      httpStatus: classified.httpStatus,
      bytes: source.body.length,
      durationMs,
    });
    return "terminal_failed";
  }

  await job.updateData({ ...payload, recoveredExternalId: vocalId }).catch(() => undefined);
  try {
    await persistReadyProfile(profile.id, vocalId);
  } catch (error) {
    await job.updateData({ ...payload, recoveredExternalId: vocalId }).catch(() => undefined);
    throw error;
  }

  logReady(payload, Date.now() - httpStartedAt);
  return "success";
}

type VocalCloneSource = { body: Buffer; contentType: string };

async function readVocalCloneSource(key: string): Promise<VocalCloneSource> {
  const storage = getWorkerStorageService();
  const metadata = await storage.getMetadata(key);

  return { body: await storage.getObject(key), contentType: metadata.contentType };
}

function logStorageBoundaryFailure(
  payload: MurekaVocalCloneJobPayload,
  error: unknown,
): void {
  logLoadControl(
    "storage_boundary_error",
    {
      service: "worker",
      operation: "vocal_clone_source_read",
      voiceProfileId: payload.voiceProfileId,
      errorCode: storageErrorCode(error),
      retryable: true,
    },
    "error",
  );
}

function logReady(payload: MurekaVocalCloneJobPayload, durationMs: number): void {
  logLoadControl("mureka_vocal_clone_profile_ready", {
    provider: "mureka",
    voiceProfileId: payload.voiceProfileId,
    sampleId: payload.voiceSampleId,
    durationMs,
  });
}

async function persistReadyProfile(profileId: string, vocalId: string): Promise<void> {
  const updated = await prisma.voiceProfile.updateMany({
    where: {
      id: profileId,
      status: "creating",
      deletedAt: null,
    },
    data: { externalId: vocalId, status: "ready" },
  });
  if (updated.count === 0) {
    const current = await prisma.voiceProfile.findUnique({ where: { id: profileId } });
    if (current?.status === "ready" && current.externalId === vocalId) {
      return;
    }
    if (current?.deletedAt || current?.status === "failed") {
      await retainVocalIdForManualDeletion(profileId, vocalId);
      return;
    }
    throw new Error("Failed to persist accepted Mureka vocal id");
  }
}

async function retainVocalIdForManualDeletion(
  profileId: string,
  vocalId: string,
): Promise<void> {
  const profile = await prisma.voiceProfile.findUnique({ where: { id: profileId } });
  if (!profile || profile.provider !== "mureka") {
    return;
  }

  const trimmed = vocalId.trim();
  if (!trimmed || trimmed.startsWith("pending:")) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (profile.externalId !== trimmed) {
      await tx.voiceProfile.update({
        where: { id: profileId },
        data: { externalId: trimmed },
      });
    }

    const existing = await tx.providerDataDeletionRequest.findFirst({
      where: {
        userId: profile.userId,
        provider: "mureka",
        resourceType: "voice_profile",
        resourceId: profileId,
        status: { in: ["pending", "submitting", "submitted_to_provider", "submit_failed"] },
      },
    });

    if (!existing) {
      await tx.providerDataDeletionRequest.create({
        data: {
          userId: profile.userId,
          provider: "mureka",
          resourceType: "voice_profile",
          resourceId: profileId,
          providerExternalId: trimmed,
          status: "pending",
          metadata: {
            note:
              "Vocal ID accepted after local soft-delete; manual Mureka deletion required",
          },
        },
      });
    }
  });
}

export function isMurekaMp3Source(contentType: string, key: string): boolean {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim();
  return normalized === "audio/mpeg" ||
    normalized === "audio/mp3" ||
    key.toLowerCase().endsWith(".mp3");
}

interface FailVoiceProfileInput {
  message: string;
  failureCode: string;
  errorKind: string;
  httpStatus?: number | null;
  bytes?: number;
  durationMs?: number;
}

async function failVoiceProfile(
  payload: MurekaVocalCloneJobPayload,
  input: FailVoiceProfileInput,
): Promise<void> {
  const current = await prisma.voiceProfile.findUnique({
    where: { id: payload.voiceProfileId },
    select: { metadata: true, status: true },
  });

  if (current?.status === "creating") {
    await prisma.voiceProfile.updateMany({
      where: {
        id: payload.voiceProfileId,
        status: "creating",
        deletedAt: null,
      },
      data: {
        status: "failed",
        metadata: mergeFailureMetadata(current.metadata, input),
      },
    });
  }

  const refunded = await refundVoiceProfile(payload);

  logLoadControl(
    "mureka_vocal_clone_terminal_failed",
    {
      provider: "mureka",
      voiceProfileId: payload.voiceProfileId,
      sampleId: payload.voiceSampleId,
      failureCode: input.failureCode,
      errorKind: input.errorKind,
      httpStatus: input.httpStatus ?? null,
      durationMs: input.durationMs ?? null,
      bytes: input.bytes ?? null,
      refundConfirmed: refunded,
    },
    "error",
  );
}

export function mergeFailureMetadata(
  metadata: unknown,
  input: FailVoiceProfileInput,
): Prisma.InputJsonValue {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};

  return {
    ...base,
    error: input.message.slice(0, 300),
    failureCode: input.failureCode,
    errorKind: input.errorKind,
    httpStatus: input.httpStatus ?? null,
  } as Prisma.InputJsonValue;
}

/** Returns true when a refund ledger row exists after this call (idempotent). */
async function refundVoiceProfile(payload: MurekaVocalCloneJobPayload): Promise<boolean> {
  const result = await refundOriginalSpend({
    userId: payload.userId,
    spendIdempotencyKey: buildMurekaVoiceProfileSpendKey(payload.voiceProfileId),
    refundIdempotencyKey: buildMurekaVoiceProfileRefundKey(payload.voiceProfileId),
    reason: "mureka_voice_profile_refund",
    relatedEntityType: "voice_profile",
    relatedEntityId: payload.voiceProfileId,
  });

  if (result.amountUnits === null) {
    logLoadControl(
      "queue_reconcile_skip",
      { provider: "mureka", voiceProfileId: payload.voiceProfileId, reason: "missing_spend" },
      "warn",
    );
    return false;
  }

  return result.refunded;
}

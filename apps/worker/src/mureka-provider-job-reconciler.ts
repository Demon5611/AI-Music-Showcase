import { Prisma, prisma, refundOriginalSpend } from "@ai-music/db";
import {
  buildMurekaMusicRefundKey,
  buildMurekaMusicSpendKey,
  buildMurekaVoiceProfileRefundKey,
  buildMurekaVoiceProfileSpendKey,
  logLoadControl,
  resolveMurekaPollDelayMs,
} from "@ai-music/shared";
import { getWorkerEnv } from "./config/env.js";
import { enqueueMurekaProviderJob } from "./mureka-provider-job-queue.js";

const MUREKA_QUEUE_STALE_MS = 30_000;
const MUREKA_POLL_STALE_MS = 30_000;
/**
 * Longer than the vocal clone job can survive in BullMQ (3 attempts, 30s
 * exponential backoff), so a profile is only failed once no worker can still
 * turn it into `ready`.
 */
export const MUREKA_VOICE_CLONE_STALE_MS = 15 * 60_000;
/** Placeholder written by the API before Mureka returns a Vocal ID. */
export const MUREKA_PENDING_EXTERNAL_ID_PREFIX = "pending:";

export function startMurekaProviderJobReconciler(): NodeJS.Timeout | null {
  const env = getWorkerEnv();
  if (!env.WORKER_PROVIDER_RECONCILER_ENABLED) {
    return null;
  }

  void reconcileMurekaProviderJobs().catch(logReconcileFailure);
  return setInterval(() => {
    void reconcileMurekaProviderJobs().catch(logReconcileFailure);
  }, env.WORKER_PROVIDER_RECONCILER_INTERVAL_MS);
}

export async function reconcileMurekaProviderJobs(): Promise<void> {
  await Promise.all([
    reconcileQueuedGenerations(),
    reconcileSubmittedGenerations(),
    reportSubmitUnknownGenerations(),
    reconcileMissingMusicRefunds(),
  ]);

  // Fail stuck clones first so the refund pass covers them in the same tick.
  await reconcileStuckVoiceClones();
  await reconcileMissingVoiceRefunds();
}

/**
 * A vocal clone job that never reached Mureka (lost job, dead worker, exhausted
 * retries) leaves the profile in `creating` with a placeholder external id and
 * the spend uncompensated. Mark it failed so the refund pass returns credits and
 * the user can retry explicitly; never re-enqueue, because a repeat submit could
 * be a second paid provider call.
 */
async function reconcileStuckVoiceClones(): Promise<void> {
  const profiles = await prisma.voiceProfile.findMany({
    where: {
      provider: "mureka",
      status: "creating",
      deletedAt: null,
      externalId: { startsWith: MUREKA_PENDING_EXTERNAL_ID_PREFIX },
      updatedAt: { lt: new Date(Date.now() - MUREKA_VOICE_CLONE_STALE_MS) },
    },
    orderBy: { updatedAt: "asc" },
    take: getWorkerEnv().WORKER_PROVIDER_RECONCILER_BATCH,
    select: { id: true, metadata: true },
  });

  for (const profile of profiles) {
    const failed = await prisma.voiceProfile.updateMany({
      where: {
        id: profile.id,
        status: "creating",
        deletedAt: null,
        externalId: { startsWith: MUREKA_PENDING_EXTERNAL_ID_PREFIX },
      },
      data: {
        status: "failed",
        metadata: buildStuckCloneMetadata(profile.metadata),
      },
    });

    if (failed.count === 0) {
      continue;
    }

    logLoadControl(
      "mureka_voice_clone_stuck_reconciled",
      { provider: "mureka", voiceProfileId: profile.id },
      "warn",
    );
  }
}

export function buildStuckCloneMetadata(metadata: unknown): Prisma.InputJsonValue {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};

  return { ...base, failureCode: "clone_stuck_reconciled" } as Prisma.InputJsonValue;
}

async function reconcileQueuedGenerations(): Promise<void> {
  const env = getWorkerEnv();
  const records = await prisma.musicGeneration.findMany({
    where: {
      provider: "mureka",
      type: "song",
      status: "pending",
      submissionState: "queued",
      providerTaskId: { startsWith: "queue:" },
      updatedAt: { lt: new Date(Date.now() - MUREKA_QUEUE_STALE_MS) },
    },
    orderBy: { updatedAt: "asc" },
    take: env.WORKER_PROVIDER_RECONCILER_BATCH,
  });

  for (const record of records) {
    const spend = await prisma.creditTransaction.findUnique({
      where: { idempotencyKey: buildMurekaMusicSpendKey(record.id) },
    });
    if (!spend) {
      await markQueuedFailed(record.id, "MUREKA_RECONCILE_MISSING_SPEND");
      continue;
    }
    if (!record.providerRequestJson) {
      await failAndRefund(record.id, record.userId, "MUREKA_RECONCILE_MISSING_REQUEST");
      continue;
    }

    await enqueueMurekaProviderJob({
      type: "mureka_music_generate",
      userId: record.userId,
      recordId: record.id,
      songInputJson: JSON.stringify(record.providerRequestJson),
      spendReason: `mureka_music_generate:${record.id}`,
    });
  }
}

async function reconcileSubmittedGenerations(): Promise<void> {
  const env = getWorkerEnv();
  const records = await prisma.musicGeneration.findMany({
    where: {
      provider: "mureka",
      type: "song",
      status: { in: ["pending", "processing"] },
      submissionState: "submitted",
      providerTaskId: { not: { startsWith: "queue:" } },
      updatedAt: { lt: new Date(Date.now() - MUREKA_POLL_STALE_MS) },
    },
    orderBy: { updatedAt: "asc" },
    take: env.WORKER_PROVIDER_RECONCILER_BATCH,
  });

  for (const record of records) {
    const submittedAtMs =
      record.submitCompletedAt?.getTime() ??
      record.submitAttemptedAt?.getTime() ??
      record.createdAt.getTime();
    await enqueueMurekaProviderJob(
      {
        type: "mureka_music_poll",
        userId: record.userId,
        recordId: record.id,
        providerTaskId: record.providerTaskId,
        submittedAtMs,
        attempt: resolveRecoveryPollAttempt(submittedAtMs),
      },
      { delayMs: resolveMurekaPollDelayMs(submittedAtMs) },
    );
  }
}

async function reportSubmitUnknownGenerations(): Promise<void> {
  const env = getWorkerEnv();
  const records = await prisma.musicGeneration.findMany({
    where: { provider: "mureka", submissionState: "submit_unknown" },
    orderBy: { submitAttemptedAt: "asc" },
    take: env.WORKER_PROVIDER_RECONCILER_BATCH,
    select: { id: true, userId: true, submitAttemptedAt: true, submitErrorCode: true },
  });

  for (const record of records) {
    logLoadControl(
      "mureka_submit_unknown_reconcile",
      {
        provider: "mureka",
        recordId: record.id,
        userId: record.userId,
        submitAttemptedAt: record.submitAttemptedAt?.toISOString() ?? null,
        submitErrorCode: record.submitErrorCode,
        action: "manual_review_required",
      },
      "warn",
    );
  }
}

async function reconcileMissingMusicRefunds(): Promise<void> {
  const records = await prisma.musicGeneration.findMany({
    where: { provider: "mureka", status: "failed" },
    take: getWorkerEnv().WORKER_PROVIDER_RECONCILER_BATCH,
    select: { id: true, userId: true },
  });
  for (const record of records) {
    const spend = await findLedgerEntry(buildMurekaMusicSpendKey(record.id));
    const refund = await findLedgerEntry(buildMurekaMusicRefundKey(record.id));
    if (spend && !refund) {
      await refundOriginalSpend({
        userId: record.userId,
        spendIdempotencyKey: buildMurekaMusicSpendKey(record.id),
        refundIdempotencyKey: buildMurekaMusicRefundKey(record.id),
        reason: "mureka_music_generate_refund",
        relatedEntityType: "music_generation",
        relatedEntityId: record.id,
      });
    }
  }
}

async function reconcileMissingVoiceRefunds(): Promise<void> {
  const profiles = await prisma.voiceProfile.findMany({
    where: { provider: "mureka", status: "failed" },
    take: getWorkerEnv().WORKER_PROVIDER_RECONCILER_BATCH,
    select: { id: true, userId: true, sourceVoiceSampleId: true },
  });
  for (const profile of profiles) {
    const spend = await findLedgerEntry(buildMurekaVoiceProfileSpendKey(profile.id));
    const refund = await findLedgerEntry(buildMurekaVoiceProfileRefundKey(profile.id));
    if (spend && !refund) {
      await refundOriginalSpend({
        userId: profile.userId,
        spendIdempotencyKey: buildMurekaVoiceProfileSpendKey(profile.id),
        refundIdempotencyKey: buildMurekaVoiceProfileRefundKey(profile.id),
        reason: "mureka_voice_profile_refund",
        relatedEntityType: "voice_profile",
        relatedEntityId: profile.id,
      });
    }
  }
}

function findLedgerEntry(idempotencyKey: string) {
  return prisma.creditTransaction.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
}

export function resolveRecoveryPollAttempt(submittedAtMs: number, nowMs = Date.now()): number {
  const elapsedMs = Math.max(0, nowMs - submittedAtMs);
  if (elapsedMs < 60_000) {
    return Math.floor(elapsedMs / 5_000) + 1;
  }
  return 13 + Math.floor((elapsedMs - 60_000) / 10_000);
}

async function markQueuedFailed(recordId: string, message: string): Promise<void> {
  await prisma.musicGeneration.updateMany({
    where: {
      id: recordId,
      provider: "mureka",
      status: "pending",
      providerTaskId: { startsWith: "queue:" },
    },
    data: { status: "failed", submissionState: "failed", errorMessage: message },
  });
}

async function failAndRefund(recordId: string, userId: string, message: string): Promise<void> {
  await markQueuedFailed(recordId, message);
  await refundOriginalSpend({
    userId,
    spendIdempotencyKey: buildMurekaMusicSpendKey(recordId),
    refundIdempotencyKey: buildMurekaMusicRefundKey(recordId),
    reason: "mureka_music_generate_refund",
    relatedEntityType: "music_generation",
    relatedEntityId: recordId,
  });
}

function logReconcileFailure(error: unknown): void {
  logLoadControl(
    "mureka_queue_reconcile_failed",
    {
      provider: "mureka",
      error: error instanceof Error ? error.message : "unknown",
    },
    "error",
  );
}

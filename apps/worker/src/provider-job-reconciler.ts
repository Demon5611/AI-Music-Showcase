import { prisma, refundCredits, type MusicGeneration } from "@ai-music/db";
import { logLoadControl } from "@ai-music/shared";
import { ensureDatabaseReady, isRetryableDbError } from "./common/db-availability.js";
import { getWorkerEnv } from "./config/env.js";
import { enqueueProviderJob } from "./provider-job-queue.js";

const QUEUE_STALE_MS = 30_000;

type ReconcilableRecord = Pick<
  MusicGeneration,
  "id" | "userId" | "providerRequestJson" | "status" | "providerTaskId"
>;

const spendKey = (recordId: string): string => `generation:${recordId}:spend`;
const refundKey = (recordId: string): string => `generation:${recordId}:refund`;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Startup: wait for DB (SELECT 1 + backoff), then reconcile once.
 * Never throws — temporary Neon outages must not exit the Worker process.
 */
export async function runStartupProviderJobReconciliation(): Promise<void> {
  const ready = await ensureDatabaseReady();

  if (!ready.ok) {
    logLoadControl(
      "worker_db_unavailable",
      {
        attempts: ready.attempts,
        retryable: ready.retryable,
        error: errorMessage(ready.error),
      },
      "error",
    );
    logLoadControl(
      "startup_reconcile_skipped",
      {
        reason: ready.retryable ? "db_unavailable" : "db_error_non_retryable",
        attempts: ready.attempts,
        error: errorMessage(ready.error),
      },
      "error",
    );
    return;
  }

  try {
    await reconcileQueuedMusicGenerations();
  } catch (error) {
    logReconcileTickFailure(error, "startup");
  }
}

export function startProviderJobReconciler(): NodeJS.Timeout | null {
  const env = getWorkerEnv();

  if (!env.WORKER_PROVIDER_RECONCILER_ENABLED) {
    return null;
  }

  void runStartupProviderJobReconciliation();

  return setInterval(() => {
    void reconcileQueuedMusicGenerations().catch((error) => {
      logReconcileTickFailure(error, "interval");
    });
  }, env.WORKER_PROVIDER_RECONCILER_INTERVAL_MS);
}

function logReconcileTickFailure(error: unknown, phase: "startup" | "interval"): void {
  const retryable = isRetryableDbError(error);

  logLoadControl(
    "queue_reconcile_tick_failed",
    {
      phase,
      retryable,
      error: errorMessage(error),
    },
    retryable ? "warn" : "error",
  );
}

export async function reconcileQueuedMusicGenerations(): Promise<void> {
  const env = getWorkerEnv();
  const staleBefore = new Date(Date.now() - QUEUE_STALE_MS);
  const records = await prisma.musicGeneration.findMany({
    where: {
      type: "song",
      status: "pending",
      providerTaskId: { startsWith: "queue:" },
      updatedAt: { lt: staleBefore },
    },
    orderBy: { updatedAt: "asc" },
    take: env.WORKER_PROVIDER_RECONCILER_BATCH,
    select: {
      id: true,
      userId: true,
      providerRequestJson: true,
      status: true,
      providerTaskId: true,
    },
  });

  for (const record of records) {
    await reconcileRecord(record);
  }
}

/**
 * Re-enqueue is safe only for a record that is still pending + queued,
 * was actually charged (spend exists), and was not refunded. Any other
 * state must not trigger a provider submit.
 */
async function reconcileRecord(record: ReconcilableRecord): Promise<void> {
  const refund = await findLedgerEntry(refundKey(record.id));

  if (refund) {
    await markFailedIfPending(record.id, "Генерация отменена, кредиты возвращены.");
    logReconcileSkip(record.id, "already_refunded");
    return;
  }

  const spend = await findLedgerEntry(spendKey(record.id));

  if (!spend) {
    // Corrupted / never-paid record: never submit, but do not loop forever as
    // pending. Fail it without a refund (there was no charge to return).
    await markFailedIfPending(record.id, "RECONCILE_MISSING_SPEND");
    logReconcileSkip(record.id, "missing_spend");
    return;
  }

  if (!record.providerRequestJson) {
    await failUnrecoverableGeneration(record.id, record.userId, Math.abs(spend.amountUnits));
    return;
  }

  await reenqueueRecord(record);
}

async function reenqueueRecord(record: ReconcilableRecord): Promise<void> {
  try {
    const outcome = await enqueueProviderJob({
      type: "music_generate",
      userId: record.userId,
      recordId: record.id,
      songInputJson: JSON.stringify(record.providerRequestJson),
      spendReason: `music_generate:${record.id}`,
    });

    // enqueued: logged inside enqueueProviderJob; already_queued: intentional no-op.
    if (outcome === "already_finished") {
      logReconcileSkip(record.id, "job_finished_desync");
    }
  } catch (error) {
    logLoadControl(
      "queue_reconcile_failed",
      {
        recordId: record.id,
        error: error instanceof Error ? error.message : "unknown",
      },
      "error",
    );
  }
}

/**
 * A queued record with no stored provider request can never be re-submitted.
 * Fail it (so the UI stops showing an infinite queue) and refund the exact
 * amount that was charged. Refund is idempotent via a stable key.
 */
async function failUnrecoverableGeneration(
  recordId: string,
  userId: string,
  refundUnits: number,
): Promise<void> {
  try {
    await refundCredits({
      userId,
      amountUnits: refundUnits,
      reason: "music_generate_refund",
      idempotencyKey: refundKey(recordId),
      relatedEntityType: "music_generation",
      relatedEntityId: recordId,
      sourceSpendIdempotencyKey: spendKey(recordId),
    });

    await markFailedIfPending(
      recordId,
      "Не удалось восстановить генерацию — параметры запроса не сохранены.",
    );

    logReconcileSkip(recordId, "missing_provider_request_json", true);
  } catch (error) {
    logLoadControl(
      "queue_reconcile_failed",
      {
        recordId,
        error: error instanceof Error ? error.message : "unknown",
      },
      "error",
    );
  }
}

function findLedgerEntry(idempotencyKey: string) {
  return prisma.creditTransaction.findUnique({
    where: { idempotencyKey },
    select: { amountUnits: true },
  });
}

async function markFailedIfPending(recordId: string, errorMessage: string): Promise<void> {
  await prisma.musicGeneration.updateMany({
    where: { id: recordId, status: "pending", providerTaskId: { startsWith: "queue:" } },
    data: { status: "failed", errorMessage },
  });
}

function logReconcileSkip(recordId: string, reason: string, refunded = false): void {
  logLoadControl("queue_reconcile_skip", { recordId, reason, refunded }, "warn");
}

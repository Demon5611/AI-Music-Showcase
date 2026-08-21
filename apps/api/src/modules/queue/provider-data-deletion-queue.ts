import { Queue } from "bullmq";
import {
  logLoadControl,
  PROVIDER_DATA_DELETION_QUEUE_NAME,
  PROVIDER_DATA_DELETION_SUBMIT_ATTEMPTS_DEFAULT,
  PROVIDER_DATA_DELETION_SUBMIT_BACKOFF_MS_DEFAULT,
  PROVIDER_DATA_DELETION_SUBMIT_JOB_NAME,
  providerDataDeletionSubmitJobId,
  type ProviderDataDeletionSubmitJobPayload,
} from "@ai-music/shared";

let queue: Queue<ProviderDataDeletionSubmitJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function getProviderDataDeletionQueue(): Queue<ProviderDataDeletionSubmitJobPayload> {
  if (!queue) {
    queue = new Queue<ProviderDataDeletionSubmitJobPayload>(
      PROVIDER_DATA_DELETION_QUEUE_NAME,
      { connection: getRedisConnection() },
    );
    queue.on("error", (error) => {
      logLoadControl(
        "provider_data_deletion_submit_enqueue",
        {
          phase: "enqueue",
          outcome: "queue_error",
          error: error instanceof Error ? error.message : "queue_error",
        },
        "error",
      );
    });
  }

  return queue;
}

/**
 * Deterministic enqueue: one job per ProviderDataDeletionRequest.
 * Duplicate jobId is idempotent (BullMQ 5).
 */
export async function enqueueProviderDataDeletionSubmitJob(
  payload: ProviderDataDeletionSubmitJobPayload,
): Promise<"enqueued"> {
  const jobId = providerDataDeletionSubmitJobId(payload.provider, payload.requestId);
  const attempts = Number(
    process.env.PROVIDER_DATA_DELETION_SUBMIT_ATTEMPTS ??
      PROVIDER_DATA_DELETION_SUBMIT_ATTEMPTS_DEFAULT,
  );
  const backoff = Number(
    process.env.PROVIDER_DATA_DELETION_SUBMIT_BACKOFF_MS ??
      PROVIDER_DATA_DELETION_SUBMIT_BACKOFF_MS_DEFAULT,
  );

  await getProviderDataDeletionQueue().add(
    PROVIDER_DATA_DELETION_SUBMIT_JOB_NAME,
    payload,
    {
      jobId,
      attempts,
      backoff: { type: "exponential", delay: backoff },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  );

  logLoadControl("provider_data_deletion_submit_enqueue", {
    phase: "enqueue",
    outcome: "enqueued",
    requestId: payload.requestId,
    provider: payload.provider,
    jobId,
  });

  return "enqueued";
}

export async function closeProviderDataDeletionQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

import { Worker, type Job } from "bullmq";
import {
  logLoadControl,
  PROVIDER_DATA_DELETION_QUEUE_NAME,
  type ProviderDataDeletionSubmitJobPayload,
} from "@ai-music/shared";
import { processProviderDataDeletionSubmit } from "./processors/process-provider-data-deletion-submit.js";

let worker: Worker<ProviderDataDeletionSubmitJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function createProviderDataDeletionWorker(): Worker<ProviderDataDeletionSubmitJobPayload> {
  const concurrency = Number(process.env.WORKER_PROVIDER_DATA_DELETION_CONCURRENCY ?? 1);

  worker = new Worker<ProviderDataDeletionSubmitJobPayload>(
    PROVIDER_DATA_DELETION_QUEUE_NAME,
    async (job: Job<ProviderDataDeletionSubmitJobPayload>) => {
      const attemptsTotal = job.opts.attempts ?? 1;
      logLoadControl("provider_data_deletion_submit_enqueue", {
        phase: "job_start",
        requestId: job.data.requestId,
        provider: job.data.provider,
        attempt: job.attemptsMade + 1,
      });
      await processProviderDataDeletionSubmit(job.data, {
        attemptsMade: job.attemptsMade,
        attemptsTotal,
      });
    },
    {
      connection: getRedisConnection(),
      concurrency,
    },
  );

  return worker;
}

export async function closeProviderDataDeletionWorker(
  instance?: Worker<ProviderDataDeletionSubmitJobPayload>,
): Promise<void> {
  const target = instance ?? worker;
  if (target) {
    await target.close();
  }
  if (!instance || instance === worker) {
    worker = null;
  }
}

import { Worker, type Job } from "bullmq";
import {
  FLITT_REFUND_QUEUE_NAME,
  type FlittRefundJobPayload,
} from "@ai-music/shared";
import { processFlittRefundJob } from "@ai-music/flitt-checkout";

let worker: Worker<FlittRefundJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function createFlittRefundWorker(): Worker<FlittRefundJobPayload> {
  const concurrency = Number(process.env.WORKER_FLITT_REFUND_CONCURRENCY ?? 1);

  worker = new Worker<FlittRefundJobPayload>(
    FLITT_REFUND_QUEUE_NAME,
    async (job: Job<FlittRefundJobPayload>) => {
      const result = await processFlittRefundJob(job.data);
      if (result.outcome === "retry") {
        throw new Error(`flitt_refund_retry:${result.reason}`);
      }
      return result;
    },
    {
      connection: getRedisConnection(),
      concurrency,
    },
  );

  return worker;
}

export async function closeFlittRefundWorker(
  instance?: Worker<FlittRefundJobPayload>,
): Promise<void> {
  const target = instance ?? worker;
  if (target) {
    await target.close();
  }
  if (!instance || instance === worker) {
    worker = null;
  }
}

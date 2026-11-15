import { Worker, type Job } from "bullmq";
import {
  CHECKOUTGATEWAY_REFUND_QUEUE_NAME,
  type CheckoutgatewayRefundJobPayload,
} from "@ai-music/shared";
import { processCheckoutgatewayRefundJob } from "@ai-music/checkoutgateway-checkout";

let worker: Worker<CheckoutgatewayRefundJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function createCheckoutgatewayRefundWorker(): Worker<CheckoutgatewayRefundJobPayload> {
  const concurrency = Number(process.env.WORKER_CHECKOUTGATEWAY_REFUND_CONCURRENCY ?? 1);

  worker = new Worker<CheckoutgatewayRefundJobPayload>(
    CHECKOUTGATEWAY_REFUND_QUEUE_NAME,
    async (job: Job<CheckoutgatewayRefundJobPayload>) => {
      const result = await processCheckoutgatewayRefundJob(job.data);
      if (result.outcome === "retry") {
        throw new Error(`checkoutgateway_refund_retry:${result.reason}`);
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

export async function closeCheckoutgatewayRefundWorker(
  instance?: Worker<CheckoutgatewayRefundJobPayload>,
): Promise<void> {
  const target = instance ?? worker;
  if (target) {
    await target.close();
  }
  if (!instance || instance === worker) {
    worker = null;
  }
}

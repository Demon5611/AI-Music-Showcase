import { Worker, type Job } from "bullmq";
import {
  LEGACYGATEWAY_REFUND_QUEUE_NAME,
  type LegacygatewayRefundJobPayload,
} from "@ai-music/shared";
import {
  assertLegacygatewayRefundProviderModeAllowed,
  createRefundPaymentProviderFromEnv,
  processLegacygatewayRefundJob,
} from "@ai-music/legacygateway-checkout";

let worker: Worker<LegacygatewayRefundJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

/** Legacy LEGACYGATEWAY refund worker. Historical provider=legacygateway rows only. */
export function createLegacygatewayRefundWorker(): Worker<LegacygatewayRefundJobPayload> {
  assertLegacygatewayRefundProviderModeAllowed();
  const concurrency = Number(process.env.WORKER_LEGACYGATEWAY_REFUND_CONCURRENCY ?? 1);

  worker = new Worker<LegacygatewayRefundJobPayload>(
    LEGACYGATEWAY_REFUND_QUEUE_NAME,
    async (job: Job<LegacygatewayRefundJobPayload>) => {
      const result = await processLegacygatewayRefundJob(job.data, {
        createProvider: () => createRefundPaymentProviderFromEnv(),
      });
      if (result.outcome === "retry") {
        throw new Error(`legacygateway_refund_retry:${result.reason}`);
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

export async function closeLegacygatewayRefundWorker(
  instance?: Worker<LegacygatewayRefundJobPayload>,
): Promise<void> {
  const target = instance ?? worker;
  if (target) {
    await target.close();
  }
  if (!instance || instance === worker) {
    worker = null;
  }
}

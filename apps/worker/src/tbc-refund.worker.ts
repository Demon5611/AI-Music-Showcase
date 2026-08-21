import { Worker, type Job } from "bullmq";
import {
  TBC_REFUND_QUEUE_NAME,
  type TbcRefundJobPayload,
} from "@ai-music/shared";
import {
  assertTbcRefundProviderModeAllowed,
  createRefundPaymentProviderFromEnv,
  processTbcRefundJob,
} from "@ai-music/tbc-checkout";

let worker: Worker<TbcRefundJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

/** Legacy TBC refund worker. Historical provider=tbc rows only. */
export function createTbcRefundWorker(): Worker<TbcRefundJobPayload> {
  assertTbcRefundProviderModeAllowed();
  const concurrency = Number(process.env.WORKER_TBC_REFUND_CONCURRENCY ?? 1);

  worker = new Worker<TbcRefundJobPayload>(
    TBC_REFUND_QUEUE_NAME,
    async (job: Job<TbcRefundJobPayload>) => {
      const result = await processTbcRefundJob(job.data, {
        createProvider: () => createRefundPaymentProviderFromEnv(),
      });
      if (result.outcome === "retry") {
        throw new Error(`tbc_refund_retry:${result.reason}`);
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

export async function closeTbcRefundWorker(
  instance?: Worker<TbcRefundJobPayload>,
): Promise<void> {
  const target = instance ?? worker;
  if (target) {
    await target.close();
  }
  if (!instance || instance === worker) {
    worker = null;
  }
}

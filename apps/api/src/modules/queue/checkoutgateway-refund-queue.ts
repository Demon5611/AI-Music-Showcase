import { Queue } from "bullmq";
import {
  CHECKOUTGATEWAY_REFUND_ATTEMPTS_DEFAULT,
  CHECKOUTGATEWAY_REFUND_BACKOFF_MS_DEFAULT,
  CHECKOUTGATEWAY_REFUND_JOB_NAME,
  CHECKOUTGATEWAY_REFUND_QUEUE_NAME,
  checkoutgatewayRefundJobId,
  type CheckoutgatewayRefundJobPayload,
} from "@ai-music/shared";
import {
  enqueueRefundJobIdempotent,
  type RefundJobEnqueueOutcome,
  type RefundQueueLike,
} from "./enqueue-refund-job.js";

let queue: Queue<CheckoutgatewayRefundJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function getCheckoutgatewayRefundQueue(): Queue<CheckoutgatewayRefundJobPayload> {
  if (!queue) {
    queue = new Queue<CheckoutgatewayRefundJobPayload>(CHECKOUTGATEWAY_REFUND_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
    queue.on("error", (error) => {
      console.error(
        JSON.stringify({
          scope: "security",
          event: "checkoutgateway_refund_queue_error",
          error: error instanceof Error ? error.message : "queue_error",
          ts: new Date().toISOString(),
        }),
      );
    });
  }

  return queue;
}

export async function enqueueCheckoutgatewayRefundJob(
  payload: CheckoutgatewayRefundJobPayload,
): Promise<RefundJobEnqueueOutcome> {
  const jobId = checkoutgatewayRefundJobId(payload.refundRequestId);
  const attempts = Number(process.env.CHECKOUTGATEWAY_REFUND_ATTEMPTS ?? CHECKOUTGATEWAY_REFUND_ATTEMPTS_DEFAULT);
  const backoff = Number(
    process.env.CHECKOUTGATEWAY_REFUND_BACKOFF_MS ?? CHECKOUTGATEWAY_REFUND_BACKOFF_MS_DEFAULT,
  );

  const outcome = await enqueueRefundJobIdempotent({
    queue: getCheckoutgatewayRefundQueue() as RefundQueueLike<CheckoutgatewayRefundJobPayload>,
    jobName: CHECKOUTGATEWAY_REFUND_JOB_NAME,
    jobId,
    payload,
    attempts,
    backoffMs: backoff,
  });

  console.info(
    JSON.stringify({
      scope: "security",
      event: "refund_job_enqueued",
      refundRequestId: payload.refundRequestId,
      jobId,
      outcome,
      ts: new Date().toISOString(),
    }),
  );

  return outcome;
}

export async function closeCheckoutgatewayRefundQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

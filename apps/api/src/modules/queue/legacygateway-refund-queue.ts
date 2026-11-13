import { Queue } from "bullmq";
import {
  LEGACYGATEWAY_REFUND_ATTEMPTS_DEFAULT,
  LEGACYGATEWAY_REFUND_BACKOFF_MS_DEFAULT,
  LEGACYGATEWAY_REFUND_JOB_NAME,
  LEGACYGATEWAY_REFUND_QUEUE_NAME,
  legacygatewayRefundJobId,
  type LegacygatewayRefundJobPayload,
} from "@ai-music/shared";
import {
  enqueueRefundJobIdempotent,
  type RefundJobEnqueueOutcome,
  type RefundQueueLike,
} from "./enqueue-refund-job.js";

let queue: Queue<LegacygatewayRefundJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

/** Legacy LEGACYGATEWAY refund queue. New checkouts never create provider=legacygateway. */
export function getLegacygatewayRefundQueue(): Queue<LegacygatewayRefundJobPayload> {
  if (!queue) {
    queue = new Queue<LegacygatewayRefundJobPayload>(LEGACYGATEWAY_REFUND_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
    queue.on("error", (error) => {
      console.error(
        JSON.stringify({
          scope: "security",
          event: "legacygateway_refund_queue_error",
          error: error instanceof Error ? error.message : "queue_error",
          ts: new Date().toISOString(),
        }),
      );
    });
  }

  return queue;
}

/**
 * Deterministic enqueue: one job per RefundRequest.
 * Duplicate jobId is reused; failed jobs are retried in place.
 */
export async function enqueueLegacygatewayRefundJob(
  payload: LegacygatewayRefundJobPayload,
): Promise<RefundJobEnqueueOutcome> {
  const jobId = legacygatewayRefundJobId(payload.refundRequestId);
  const attempts = Number(
    process.env.LEGACYGATEWAY_REFUND_ATTEMPTS ?? LEGACYGATEWAY_REFUND_ATTEMPTS_DEFAULT,
  );
  const backoff = Number(
    process.env.LEGACYGATEWAY_REFUND_BACKOFF_MS ?? LEGACYGATEWAY_REFUND_BACKOFF_MS_DEFAULT,
  );

  const outcome = await enqueueRefundJobIdempotent({
    queue: getLegacygatewayRefundQueue() as RefundQueueLike<LegacygatewayRefundJobPayload>,
    jobName: LEGACYGATEWAY_REFUND_JOB_NAME,
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

export async function closeLegacygatewayRefundQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

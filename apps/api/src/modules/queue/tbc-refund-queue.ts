import { Queue } from "bullmq";
import {
  TBC_REFUND_ATTEMPTS_DEFAULT,
  TBC_REFUND_BACKOFF_MS_DEFAULT,
  TBC_REFUND_JOB_NAME,
  TBC_REFUND_QUEUE_NAME,
  tbcRefundJobId,
  type TbcRefundJobPayload,
} from "@ai-music/shared";
import {
  enqueueRefundJobIdempotent,
  type RefundJobEnqueueOutcome,
  type RefundQueueLike,
} from "./enqueue-refund-job.js";

let queue: Queue<TbcRefundJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

/** Legacy TBC refund queue. New checkouts never create provider=tbc. */
export function getTbcRefundQueue(): Queue<TbcRefundJobPayload> {
  if (!queue) {
    queue = new Queue<TbcRefundJobPayload>(TBC_REFUND_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
    queue.on("error", (error) => {
      console.error(
        JSON.stringify({
          scope: "security",
          event: "tbc_refund_queue_error",
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
export async function enqueueTbcRefundJob(
  payload: TbcRefundJobPayload,
): Promise<RefundJobEnqueueOutcome> {
  const jobId = tbcRefundJobId(payload.refundRequestId);
  const attempts = Number(
    process.env.TBC_REFUND_ATTEMPTS ?? TBC_REFUND_ATTEMPTS_DEFAULT,
  );
  const backoff = Number(
    process.env.TBC_REFUND_BACKOFF_MS ?? TBC_REFUND_BACKOFF_MS_DEFAULT,
  );

  const outcome = await enqueueRefundJobIdempotent({
    queue: getTbcRefundQueue() as RefundQueueLike<TbcRefundJobPayload>,
    jobName: TBC_REFUND_JOB_NAME,
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

export async function closeTbcRefundQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

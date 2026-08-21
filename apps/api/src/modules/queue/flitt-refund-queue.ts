import { Queue } from "bullmq";
import {
  FLITT_REFUND_ATTEMPTS_DEFAULT,
  FLITT_REFUND_BACKOFF_MS_DEFAULT,
  FLITT_REFUND_JOB_NAME,
  FLITT_REFUND_QUEUE_NAME,
  flittRefundJobId,
  type FlittRefundJobPayload,
} from "@ai-music/shared";
import {
  enqueueRefundJobIdempotent,
  type RefundJobEnqueueOutcome,
  type RefundQueueLike,
} from "./enqueue-refund-job.js";

let queue: Queue<FlittRefundJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function getFlittRefundQueue(): Queue<FlittRefundJobPayload> {
  if (!queue) {
    queue = new Queue<FlittRefundJobPayload>(FLITT_REFUND_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
    queue.on("error", (error) => {
      console.error(
        JSON.stringify({
          scope: "security",
          event: "flitt_refund_queue_error",
          error: error instanceof Error ? error.message : "queue_error",
          ts: new Date().toISOString(),
        }),
      );
    });
  }

  return queue;
}

export async function enqueueFlittRefundJob(
  payload: FlittRefundJobPayload,
): Promise<RefundJobEnqueueOutcome> {
  const jobId = flittRefundJobId(payload.refundRequestId);
  const attempts = Number(process.env.FLITT_REFUND_ATTEMPTS ?? FLITT_REFUND_ATTEMPTS_DEFAULT);
  const backoff = Number(
    process.env.FLITT_REFUND_BACKOFF_MS ?? FLITT_REFUND_BACKOFF_MS_DEFAULT,
  );

  const outcome = await enqueueRefundJobIdempotent({
    queue: getFlittRefundQueue() as RefundQueueLike<FlittRefundJobPayload>,
    jobName: FLITT_REFUND_JOB_NAME,
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

export async function closeFlittRefundQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

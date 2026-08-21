import type { JobsOptions } from "bullmq";

export type RefundJobEnqueueOutcome = "queued" | "already_queued";

type ExistingRefundJob = {
  timestamp?: number;
  getState(): Promise<string>;
  retry(): Promise<void>;
};

export type RefundQueueLike<T> = {
  getJob(jobId: string): Promise<ExistingRefundJob | undefined | null>;
  add(name: string, payload: T, opts: JobsOptions): Promise<{ timestamp?: number }>;
};

const ACTIVE_STATES = new Set([
  "waiting",
  "delayed",
  "active",
  "paused",
  "waiting-children",
]);

function wasJobJustCreated(jobTimestamp: number | undefined, addStartedAtMs: number): boolean {
  if (jobTimestamp === undefined) {
    return true;
  }
  return jobTimestamp >= addStartedAtMs - 50;
}

export function isDuplicateRefundJobIdError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists/i.test(message);
}

/**
 * One RefundRequest → one BullMQ jobId.
 * Existing waiting/active jobs are reused. Failed jobs are retried in place.
 * Completed jobs are not re-added (worker already ran).
 */
export async function enqueueRefundJobIdempotent<T>(input: {
  queue: RefundQueueLike<T>;
  jobName: string;
  jobId: string;
  payload: T;
  attempts: number;
  backoffMs: number;
}): Promise<RefundJobEnqueueOutcome> {
  const existing = await input.queue.getJob(input.jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "failed") {
      await existing.retry();
      return "queued";
    }
    if (state === "completed" || ACTIVE_STATES.has(state)) {
      return "already_queued";
    }
    return "already_queued";
  }

  const addStartedAtMs = Date.now();
  try {
    const job = await input.queue.add(input.jobName, input.payload, {
      jobId: input.jobId,
      attempts: input.attempts,
      backoff: { type: "exponential", delay: input.backoffMs },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    return wasJobJustCreated(job.timestamp, addStartedAtMs) ? "queued" : "already_queued";
  } catch (error) {
    if (isDuplicateRefundJobIdError(error)) {
      return "already_queued";
    }
    throw error;
  }
}

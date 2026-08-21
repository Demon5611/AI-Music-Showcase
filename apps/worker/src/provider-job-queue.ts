import { Queue } from "bullmq";
import { logLoadControl, PROVIDER_JOB_QUEUE_NAME, type ProviderJobPayload } from "@ai-music/shared";

let queue: Queue<ProviderJobPayload> | null = null;

function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
  };
}

export function getProviderJobQueue(): Queue<ProviderJobPayload> {
  if (!queue) {
    queue = new Queue<ProviderJobPayload>(PROVIDER_JOB_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }

  return queue;
}

/**
 * Result of a deterministic-jobId enqueue attempt.
 * - `enqueued`: a new job was added (jobId was absent);
 * - `already_queued`: a job with this id is waiting/delayed/active/prioritized;
 * - `already_finished`: a retained completed/failed job exists — do NOT re-submit.
 */
export type ProviderJobEnqueueOutcome = "enqueued" | "already_queued" | "already_finished";

function providerJobId(payload: ProviderJobPayload): string {
  const stableId = payload.type === "stem_separation" ? payload.songId : payload.recordId;
  return `provider:${payload.type}:${stableId}`;
}

function logEnqueueOutcome(
  outcome: ProviderJobEnqueueOutcome,
  fields: {
    jobId: string;
    jobType: string;
    userId: string;
    recordId: string | null;
  },
): void {
  if (outcome === "enqueued") {
    logLoadControl("queue_reconcile_enqueue", {
      queue: PROVIDER_JOB_QUEUE_NAME,
      jobId: fields.jobId,
      jobType: fields.jobType,
      userId: fields.userId,
      recordId: fields.recordId,
    });
    return;
  }

  logLoadControl(
    "queue_enqueue_skip",
    {
      queue: PROVIDER_JOB_QUEUE_NAME,
      jobId: fields.jobId,
      jobType: fields.jobType,
      userId: fields.userId,
      recordId: fields.recordId,
      reason: outcome === "already_finished" ? "job_finished" : "already_queued",
    },
    outcome === "already_finished" ? "warn" : "info",
  );
}

function wasJobJustCreated(jobTimestamp: number | undefined, addStartedAtMs: number): boolean {
  if (jobTimestamp === undefined) {
    return true;
  }

  return jobTimestamp >= addStartedAtMs - 50;
}

/**
 * Enqueue by deterministic jobId, inspecting BullMQ state first.
 * A job is added only when its id is absent; existing active or finished jobs
 * are never blindly re-submitted (prevents duplicate provider submits).
 */
export async function enqueueProviderJob(
  payload: ProviderJobPayload,
): Promise<ProviderJobEnqueueOutcome> {
  const jobId = providerJobId(payload);
  const queueRef = getProviderJobQueue();
  const logFields = {
    jobId,
    jobType: payload.type,
    userId: payload.userId,
    recordId: "recordId" in payload ? payload.recordId : null,
  };

  const existing = await queueRef.getJob(jobId);

  if (existing) {
    const state = await existing.getState();
    const outcome =
      state === "completed" || state === "failed" ? "already_finished" : "already_queued";
    logEnqueueOutcome(outcome, logFields);
    return outcome;
  }

  const addStartedAtMs = Date.now();
  const job = await queueRef.add(payload.type, payload, {
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });

  const outcome: ProviderJobEnqueueOutcome = wasJobJustCreated(job.timestamp, addStartedAtMs)
    ? "enqueued"
    : "already_queued";
  logEnqueueOutcome(outcome, logFields);
  return outcome;
}

export async function closeProviderJobQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

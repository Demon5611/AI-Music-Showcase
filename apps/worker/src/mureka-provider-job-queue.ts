import {
  logLoadControl,
  MUREKA_PROVIDER_JOB_QUEUE_NAME,
  murekaProviderJobId,
  type MurekaProviderJobPayload,
} from "@ai-music/shared";
import { Queue } from "bullmq";

let queue: Queue<MurekaProviderJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function getMurekaProviderJobQueue(): Queue<MurekaProviderJobPayload> {
  if (!queue) {
    queue = new Queue<MurekaProviderJobPayload>(MUREKA_PROVIDER_JOB_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }

  return queue;
}

export async function enqueueMurekaProviderJob(
  payload: MurekaProviderJobPayload,
  options: { delayMs?: number; priority?: number } = {},
): Promise<void> {
  const jobId = murekaProviderJobId(payload);
  const existing = await getMurekaProviderJobQueue().getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      await existing.remove().catch(() => undefined);
    }
  }

  await getMurekaProviderJobQueue().add(payload.type, payload, {
    jobId,
    delay: options.delayMs ?? 0,
    ...(options.priority === undefined ? {} : { priority: options.priority }),
    attempts: payload.type === "mureka_music_poll" ? 5 : 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });

  logLoadControl("queue_reconcile_enqueue", {
    provider: "mureka",
    queue: MUREKA_PROVIDER_JOB_QUEUE_NAME,
    jobId,
    jobType: payload.type,
    userId: payload.userId,
    recordId: "recordId" in payload ? payload.recordId : null,
    delayMs: options.delayMs ?? 0,
  });
}

export async function closeMurekaProviderJobQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

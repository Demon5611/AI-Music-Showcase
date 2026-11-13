import {
  logLoadControl,
  AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
  audioengineProviderJobId,
  type AudioengineProviderJobPayload,
} from "@ai-music/shared";
import { Queue } from "bullmq";

let queue: Queue<AudioengineProviderJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function getAudioengineProviderJobQueue(): Queue<AudioengineProviderJobPayload> {
  if (!queue) {
    queue = new Queue<AudioengineProviderJobPayload>(AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }

  return queue;
}

export async function enqueueAudioengineProviderJob(
  payload: AudioengineProviderJobPayload,
  options: { delayMs?: number; priority?: number } = {},
): Promise<void> {
  const jobId = audioengineProviderJobId(payload);
  const existing = await getAudioengineProviderJobQueue().getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "completed" || state === "failed") {
      await existing.remove().catch(() => undefined);
    }
  }

  await getAudioengineProviderJobQueue().add(payload.type, payload, {
    jobId,
    delay: options.delayMs ?? 0,
    ...(options.priority === undefined ? {} : { priority: options.priority }),
    attempts: payload.type === "audioengine_music_poll" ? 5 : 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });

  logLoadControl("queue_reconcile_enqueue", {
    provider: "audioengine",
    queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
    jobId,
    jobType: payload.type,
    userId: payload.userId,
    recordId: "recordId" in payload ? payload.recordId : null,
    delayMs: options.delayMs ?? 0,
  });
}

export async function closeAudioengineProviderJobQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

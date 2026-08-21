import { Queue } from "bullmq";
import {
  GENERATION_QUEUE_NAME,
  type GenerationJobPayload,
} from "@ai-music/shared";

let queue: Queue<GenerationJobPayload> | null = null;

function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
  };
}

export function getGenerationQueue(): Queue<GenerationJobPayload> {
  if (!queue) {
    queue = new Queue<GenerationJobPayload>(GENERATION_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }

  return queue;
}

export async function enqueueGenerationJob(
  payload: GenerationJobPayload,
  priority = 1,
) {
  await getGenerationQueue().add("generate", payload, {
    jobId: `generation:${payload.jobId}`,
    priority,
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
}

export async function closeGenerationQueue() {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

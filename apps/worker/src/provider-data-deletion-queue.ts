import { Queue } from "bullmq";
import {
  PROVIDER_DATA_DELETION_QUEUE_NAME,
  type ProviderDataDeletionSubmitJobPayload,
} from "@ai-music/shared";

let queue: Queue<ProviderDataDeletionSubmitJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function getProviderDataDeletionQueue(): Queue<ProviderDataDeletionSubmitJobPayload> {
  if (!queue) {
    queue = new Queue<ProviderDataDeletionSubmitJobPayload>(
      PROVIDER_DATA_DELETION_QUEUE_NAME,
      { connection: getRedisConnection() },
    );
  }
  return queue;
}

export async function closeProviderDataDeletionQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

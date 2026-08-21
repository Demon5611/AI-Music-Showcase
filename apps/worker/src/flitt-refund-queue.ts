import { Queue } from "bullmq";
import { FLITT_REFUND_QUEUE_NAME, type FlittRefundJobPayload } from "@ai-music/shared";

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
  }
  return queue;
}

export async function closeFlittRefundQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

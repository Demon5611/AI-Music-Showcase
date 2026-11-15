import { Queue } from "bullmq";
import {
  LEGACYGATEWAY_REFUND_QUEUE_NAME,
  type LegacygatewayRefundJobPayload,
} from "@ai-music/shared";

let queue: Queue<LegacygatewayRefundJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function getLegacygatewayRefundQueue(): Queue<LegacygatewayRefundJobPayload> {
  if (!queue) {
    queue = new Queue<LegacygatewayRefundJobPayload>(LEGACYGATEWAY_REFUND_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return queue;
}

export async function closeLegacygatewayRefundQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

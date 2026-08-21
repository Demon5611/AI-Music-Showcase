import { Queue } from "bullmq";
import {
  TBC_REFUND_QUEUE_NAME,
  type TbcRefundJobPayload,
} from "@ai-music/shared";

let queue: Queue<TbcRefundJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function getTbcRefundQueue(): Queue<TbcRefundJobPayload> {
  if (!queue) {
    queue = new Queue<TbcRefundJobPayload>(TBC_REFUND_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return queue;
}

export async function closeTbcRefundQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

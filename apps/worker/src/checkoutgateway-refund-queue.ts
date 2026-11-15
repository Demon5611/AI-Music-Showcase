import { Queue } from "bullmq";
import { CHECKOUTGATEWAY_REFUND_QUEUE_NAME, type CheckoutgatewayRefundJobPayload } from "@ai-music/shared";

let queue: Queue<CheckoutgatewayRefundJobPayload> | null = null;

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function getCheckoutgatewayRefundQueue(): Queue<CheckoutgatewayRefundJobPayload> {
  if (!queue) {
    queue = new Queue<CheckoutgatewayRefundJobPayload>(CHECKOUTGATEWAY_REFUND_QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }
  return queue;
}

export async function closeCheckoutgatewayRefundQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

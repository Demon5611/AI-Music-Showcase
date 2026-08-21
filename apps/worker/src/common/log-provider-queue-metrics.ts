import { logLoadControl, PROVIDER_JOB_QUEUE_NAME } from "@ai-music/shared";
import { Queue } from "bullmq";

function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
  };
}

let queue: Queue | null = null;

function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(PROVIDER_JOB_QUEUE_NAME, { connection: getRedisConnection() });
  }

  return queue;
}

/** Worker-side queue metrics (same JSON format as API). See docs/music-generation-queue-load-control.md */
export async function logProviderQueueMetrics(): Promise<void> {
  const counts = await getQueue().getJobCounts(
    "waiting",
    "active",
    "delayed",
    "failed",
    "completed",
  );

  const waiting = counts.waiting ?? 0;
  const active = counts.active ?? 0;

  logLoadControl(
    "queue_metrics",
    {
      source: "worker",
      queue: PROVIDER_JOB_QUEUE_NAME,
      waiting,
      active,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      completed: counts.completed ?? 0,
    },
    waiting >= 50 ? "warn" : "info",
  );
}

export async function closeProviderQueueMetrics(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

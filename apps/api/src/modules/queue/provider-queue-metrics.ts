/**
 * BullMQ provider-jobs metrics, backpressure, and structured logging.
 * @see docs/music-generation-queue-load-control.md
 */
import type { Queue } from "bullmq";
import {
  logLoadControl,
  PROVIDER_JOB_QUEUE_NAME,
  PROVIDER_QUEUE_ALERT_THRESHOLD,
  PROVIDER_QUEUE_BACKPRESSURE_THRESHOLD,
  SUNO_SUBMIT_RATE_PER_SEC,
  type ProviderJobPayload,
} from "@ai-music/shared";
import { ServiceUnavailableError } from "../../common/errors.js";
import { getProviderJobQueue } from "./provider-job-queue.js";

export {
  PROVIDER_QUEUE_ALERT_THRESHOLD,
  PROVIDER_QUEUE_BACKPRESSURE_THRESHOLD,
  SUNO_SUBMIT_RATE_PER_SEC,
};

export interface ProviderQueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  estimatedSubmitWaitSec: number;
}

export async function getProviderQueueMetrics(): Promise<ProviderQueueMetrics> {
  const counts = await getProviderJobQueue().getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
  );

  const waiting = counts.waiting ?? 0;
  const active = counts.active ?? 0;

  return {
    waiting,
    active,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    estimatedSubmitWaitSec: estimateProviderQueueWaitSec(waiting + active),
  };
}

export function estimateProviderQueueWaitSec(jobsAhead: number): number {
  if (jobsAhead <= 0) {
    return 0;
  }

  return Math.ceil(jobsAhead / SUNO_SUBMIT_RATE_PER_SEC);
}

export async function assertProviderQueueCapacity(): Promise<void> {
  const metrics = await getProviderQueueMetrics();

  if (metrics.waiting >= PROVIDER_QUEUE_BACKPRESSURE_THRESHOLD) {
    logLoadControl(
      "queue_backpressure",
      {
        waiting: metrics.waiting,
        active: metrics.active,
        threshold: PROVIDER_QUEUE_BACKPRESSURE_THRESHOLD,
        retryAfterSec: metrics.estimatedSubmitWaitSec,
      },
      "warn",
    );

    throw new ServiceUnavailableError(
      "Очередь генерации перегружена. Попробуйте через несколько минут.",
      metrics.estimatedSubmitWaitSec,
    );
  }
}

export async function logProviderQueueMetrics(
  source: "api" | "worker",
  queue: Queue<ProviderJobPayload> = getProviderJobQueue(),
): Promise<void> {
  const metrics = await getProviderQueueMetrics();
  const level = metrics.waiting >= PROVIDER_QUEUE_ALERT_THRESHOLD ? "warn" : "info";

  logLoadControl(
    "queue_metrics",
    {
      source,
      queue: PROVIDER_JOB_QUEUE_NAME,
      waiting: metrics.waiting,
      active: metrics.active,
      delayed: metrics.delayed,
      failed: metrics.failed,
      completed: metrics.completed,
      etaSec: metrics.estimatedSubmitWaitSec,
      alertThreshold: PROVIDER_QUEUE_ALERT_THRESHOLD,
      backpressureThreshold: PROVIDER_QUEUE_BACKPRESSURE_THRESHOLD,
    },
    level,
  );

  void queue;
}

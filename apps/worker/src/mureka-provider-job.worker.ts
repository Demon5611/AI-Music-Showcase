import {
  logLoadControl,
  MUREKA_PROVIDER_JOB_QUEUE_NAME,
  type MurekaProviderJobPayload,
} from "@ai-music/shared";
import { Worker } from "bullmq";
import { getWorkerEnv } from "./config/env.js";
import { processMurekaProviderJob } from "./processors/process-mureka-provider-job.js";

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function createMurekaProviderJobWorker(): Worker<MurekaProviderJobPayload> {
  const concurrency = getWorkerEnv().MUREKA_WORKER_CONCURRENCY;

  return new Worker<MurekaProviderJobPayload>(
    MUREKA_PROVIDER_JOB_QUEUE_NAME,
    async (job) => {
      const startedAt = Date.now();
      logLoadControl("provider_job_lifecycle", {
        provider: "mureka",
        phase: "start",
        queue: MUREKA_PROVIDER_JOB_QUEUE_NAME,
        jobId: job.id ?? null,
        jobType: job.data.type,
        userId: job.data.userId,
        waitMs: job.processedOn ? job.processedOn - job.timestamp : null,
      });

      try {
        const result = await processMurekaProviderJob(job.data, job);
        logLoadControl("mureka_provider_job_outcome", {
          provider: "mureka",
          queue: MUREKA_PROVIDER_JOB_QUEUE_NAME,
          jobId: job.id ?? null,
          jobType: job.data.type,
          outcome: result.outcome,
          durationMs: Date.now() - startedAt,
        });
        logLoadControl("provider_job_lifecycle", {
          provider: "mureka",
          phase: "done",
          queue: MUREKA_PROVIDER_JOB_QUEUE_NAME,
          jobId: job.id ?? null,
          jobType: job.data.type,
          outcome: result.outcome,
          durationMs: Date.now() - startedAt,
        });
        return result;
      } catch (error) {
        logLoadControl(
          "mureka_provider_job_outcome",
          {
            provider: "mureka",
            queue: MUREKA_PROVIDER_JOB_QUEUE_NAME,
            jobId: job.id ?? null,
            jobType: job.data.type,
            outcome: "retry_scheduled",
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
          },
          "warn",
        );
        logLoadControl(
          "provider_job_lifecycle",
          {
            provider: "mureka",
            phase: "failed",
            queue: MUREKA_PROVIDER_JOB_QUEUE_NAME,
            jobId: job.id ?? null,
            jobType: job.data.type,
            outcome: "retry_scheduled",
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : "unknown",
          },
          "error",
        );
        throw error;
      }
    },
    { connection: getRedisConnection(), concurrency },
  );
}

export async function closeMurekaProviderJobWorker(
  worker: Worker<MurekaProviderJobPayload>,
): Promise<void> {
  await worker.close();
}

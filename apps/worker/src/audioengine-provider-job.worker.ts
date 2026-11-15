import {
  logLoadControl,
  AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
  type AudioengineProviderJobPayload,
} from "@ai-music/shared";
import { Worker } from "bullmq";
import { getWorkerEnv } from "./config/env.js";
import { processAudioengineProviderJob } from "./processors/process-audioengine-provider-job.js";

function getRedisConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    maxRetriesPerRequest: null,
  };
}

export function createAudioengineProviderJobWorker(): Worker<AudioengineProviderJobPayload> {
  const concurrency = getWorkerEnv().AUDIOENGINE_WORKER_CONCURRENCY;

  return new Worker<AudioengineProviderJobPayload>(
    AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
    async (job) => {
      const startedAt = Date.now();
      logLoadControl("provider_job_lifecycle", {
        provider: "audioengine",
        phase: "start",
        queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
        jobId: job.id ?? null,
        jobType: job.data.type,
        userId: job.data.userId,
        waitMs: job.processedOn ? job.processedOn - job.timestamp : null,
      });

      try {
        const result = await processAudioengineProviderJob(job.data, job);
        logLoadControl("audioengine_provider_job_outcome", {
          provider: "audioengine",
          queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
          jobId: job.id ?? null,
          jobType: job.data.type,
          outcome: result.outcome,
          durationMs: Date.now() - startedAt,
        });
        logLoadControl("provider_job_lifecycle", {
          provider: "audioengine",
          phase: "done",
          queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
          jobId: job.id ?? null,
          jobType: job.data.type,
          outcome: result.outcome,
          durationMs: Date.now() - startedAt,
        });
        return result;
      } catch (error) {
        logLoadControl(
          "audioengine_provider_job_outcome",
          {
            provider: "audioengine",
            queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
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
            provider: "audioengine",
            phase: "failed",
            queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
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

export async function closeAudioengineProviderJobWorker(
  worker: Worker<AudioengineProviderJobPayload>,
): Promise<void> {
  await worker.close();
}

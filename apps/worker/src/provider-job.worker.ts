import { prisma } from "@ai-music/db";
import { logLoadControl, PROVIDER_JOB_QUEUE_NAME, type ProviderJobPayload } from "@ai-music/shared";
import { Worker } from "bullmq";
import { processProviderJob } from "./processors/process-provider-job.js";

function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
  };
}

export function createProviderJobWorker() {
  const concurrency = Number(process.env.WORKER_PROVIDER_CONCURRENCY ?? 4);

  return new Worker<ProviderJobPayload>(
    PROVIDER_JOB_QUEUE_NAME,
    async (job) => {
      const startedAt = Date.now();
      const waitMs = job.processedOn && job.timestamp ? job.processedOn - job.timestamp : null;

      logLoadControl("provider_job_lifecycle", {
        phase: "start",
        queue: PROVIDER_JOB_QUEUE_NAME,
        jobId: job.id ?? null,
        jobType: job.data.type,
        userId: job.data.userId,
        waitMs,
        priority: job.opts.priority ?? null,
      });

      try {
        const maxAttempts = job.opts.attempts ?? 1;
        await processProviderJob(
          job.data,
          {
            attempt: (job.attemptsMade ?? 0) + 1,
            maxAttempts,
          },
          job,
        );
        logLoadControl("provider_job_lifecycle", {
          phase: "done",
          queue: PROVIDER_JOB_QUEUE_NAME,
          jobId: job.id ?? null,
          jobType: job.data.type,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        logLoadControl(
          "provider_job_lifecycle",
          {
            phase: "failed",
            queue: PROVIDER_JOB_QUEUE_NAME,
            jobId: job.id ?? null,
            jobType: job.data.type,
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

export async function closeProviderJobWorker(worker: Worker) {
  await worker.close();
  await prisma.$disconnect();
}

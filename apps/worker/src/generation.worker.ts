import { prisma } from "@ai-music/db";
import { GENERATION_QUEUE_NAME, type GenerationJobPayload } from "@ai-music/shared";
import { Worker } from "bullmq";
import { processGenerationJob } from "./processors/generate-song.js";

function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
  };
}

export function createGenerationWorker() {
  return new Worker<GenerationJobPayload>(
    GENERATION_QUEUE_NAME,
    async (job) => {
      await processGenerationJob(job.data);
    },
    { connection: getRedisConnection() },
  );
}

export async function closeGenerationWorker(worker: Worker) {
  await worker.close();
  await prisma.$disconnect();
}

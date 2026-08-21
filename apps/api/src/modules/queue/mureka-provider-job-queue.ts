import {
  logLoadControl,
  MUREKA_PROVIDER_JOB_QUEUE_NAME,
  murekaProviderJobId,
  type MurekaProviderJobPayload,
  type MurekaVocalCloneJobPayload,
} from "@ai-music/shared";
import { Queue } from "bullmq";

let queue: Queue<MurekaProviderJobPayload> | null = null;

export function getMurekaProviderJobQueue(): Queue<MurekaProviderJobPayload> {
  if (!queue) {
    queue = new Queue<MurekaProviderJobPayload>(MUREKA_PROVIDER_JOB_QUEUE_NAME, {
      connection: {
        url: process.env.REDIS_URL ?? "redis://localhost:6379",
        maxRetriesPerRequest: null,
      },
    });
  }
  return queue;
}

export async function enqueueMurekaProviderJob(
  payload: MurekaProviderJobPayload,
  priority?: number,
): Promise<void> {
  const jobId = murekaProviderJobId(payload);
  await getMurekaProviderJobQueue().add(payload.type, payload, {
    jobId,
    ...(priority === undefined ? {} : { priority }),
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
  logLoadControl("queue_enqueue", {
    provider: "mureka",
    queue: MUREKA_PROVIDER_JOB_QUEUE_NAME,
    jobId,
    jobType: payload.type,
    priority: priority ?? null,
    userId: payload.userId,
    recordId: "recordId" in payload ? payload.recordId : null,
  });
}

export function enqueueMurekaVocalCloneJob(
  payload: MurekaVocalCloneJobPayload,
): Promise<void> {
  return enqueueMurekaProviderJob(payload);
}

/** Remove a queued vocal-clone job before provider HTTP if still waiting. */
export async function removeMurekaVocalCloneJobIfQueued(
  voiceProfileId: string,
): Promise<boolean> {
  const jobId = murekaProviderJobId({
    type: "mureka_vocal_clone",
    userId: "noop",
    voiceProfileId,
    voiceSampleId: "noop",
    spendReason: "noop",
  });
  const queue = getMurekaProviderJobQueue();
  const job = await queue.getJob(jobId);
  if (!job) {
    return false;
  }

  const state = await job.getState();
  if (state !== "waiting" && state !== "delayed") {
    return false;
  }

  await job.remove();
  logLoadControl("queue_enqueue_skip", {
    provider: "mureka",
    queue: MUREKA_PROVIDER_JOB_QUEUE_NAME,
    jobId,
    jobType: "mureka_vocal_clone",
    reason: "voice_profile_deletion",
    voiceProfileId,
  });
  return true;
}

export async function closeMurekaProviderJobQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

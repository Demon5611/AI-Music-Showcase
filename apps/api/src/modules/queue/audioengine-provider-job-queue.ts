import {
  logLoadControl,
  AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
  audioengineProviderJobId,
  type AudioengineProviderJobPayload,
  type AudioengineVocalCloneJobPayload,
} from "@ai-music/shared";
import { Queue } from "bullmq";

let queue: Queue<AudioengineProviderJobPayload> | null = null;

export function getAudioengineProviderJobQueue(): Queue<AudioengineProviderJobPayload> {
  if (!queue) {
    queue = new Queue<AudioengineProviderJobPayload>(AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME, {
      connection: {
        url: process.env.REDIS_URL ?? "redis://localhost:6379",
        maxRetriesPerRequest: null,
      },
    });
  }
  return queue;
}

export async function enqueueAudioengineProviderJob(
  payload: AudioengineProviderJobPayload,
  priority?: number,
): Promise<void> {
  const jobId = audioengineProviderJobId(payload);
  await getAudioengineProviderJobQueue().add(payload.type, payload, {
    jobId,
    ...(priority === undefined ? {} : { priority }),
    attempts: 3,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
  logLoadControl("queue_enqueue", {
    provider: "audioengine",
    queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
    jobId,
    jobType: payload.type,
    priority: priority ?? null,
    userId: payload.userId,
    recordId: "recordId" in payload ? payload.recordId : null,
  });
}

export function enqueueAudioengineVocalCloneJob(
  payload: AudioengineVocalCloneJobPayload,
): Promise<void> {
  return enqueueAudioengineProviderJob(payload);
}

/** Remove a queued vocal-clone job before provider HTTP if still waiting. */
export async function removeAudioengineVocalCloneJobIfQueued(
  voiceProfileId: string,
): Promise<boolean> {
  const jobId = audioengineProviderJobId({
    type: "audioengine_vocal_clone",
    userId: "noop",
    voiceProfileId,
    voiceSampleId: "noop",
    spendReason: "noop",
  });
  const queue = getAudioengineProviderJobQueue();
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
    provider: "audioengine",
    queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
    jobId,
    jobType: "audioengine_vocal_clone",
    reason: "voice_profile_deletion",
    voiceProfileId,
  });
  return true;
}

export async function closeAudioengineProviderJobQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}

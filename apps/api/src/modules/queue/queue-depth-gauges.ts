import {
  musicGenerationQueueDepth,
  musicPersistenceQueueDepth,
} from "@ai-music/observability";
import { getProviderJobQueue } from "./provider-job-queue.js";
import { getMusicTrackPersistenceQueue } from "./music-track-persistence-queue.js";

/** Refresh BullMQ waiting+delayed gauges (excludes active/paused). Safe for /metrics scrape. */
export async function refreshQueueDepthGauges(): Promise<void> {
  const [providerCounts, persistCounts] = await Promise.all([
    getProviderJobQueue().getJobCounts("waiting", "delayed"),
    getMusicTrackPersistenceQueue().getJobCounts("waiting", "delayed"),
  ]);

  musicGenerationQueueDepth.set((providerCounts.waiting ?? 0) + (providerCounts.delayed ?? 0));
  musicPersistenceQueueDepth.set((persistCounts.waiting ?? 0) + (persistCounts.delayed ?? 0));
}

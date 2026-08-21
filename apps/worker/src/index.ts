import "./common/load-env.js";
import {
  musicGenerationQueueDepth,
  musicPersistenceQueueDepth,
  startDefaultProcessMetrics,
  startMetricsHttpServer,
} from "@ai-music/observability";
import {
  canListenMurekaProviderJobs,
} from "@ai-music/ai-providers";
import {
  logLoadControl,
  MUREKA_PROVIDER_JOB_QUEUE_NAME,
  resolveMurekaFeatureFlags,
  type MurekaProviderJobPayload,
} from "@ai-music/shared";
import type { Worker } from "bullmq";
import { closeGenerationWorker, createGenerationWorker } from "./generation.worker.js";
import { closeProviderJobWorker, createProviderJobWorker } from "./provider-job.worker.js";
import {
  closeProviderQueueMetrics,
  logProviderQueueMetrics,
} from "./common/log-provider-queue-metrics.js";
import { logStorageConfig } from "./common/storage-config.js";
import { startProviderJobReconciler } from "./provider-job-reconciler.js";
import { closeProviderJobQueue, getProviderJobQueue } from "./provider-job-queue.js";
import {
  closeMusicTrackPersistenceWorker,
  createMusicTrackPersistenceWorker,
} from "./music-track-persistence.worker.js";
import {
  closeMusicTrackPersistenceQueue,
  getMusicTrackPersistenceQueue,
} from "./music-track-persistence-queue.js";
import { startMusicTrackPersistenceReconciler } from "./music-track-persistence-reconciler.js";
import {
  closeProviderDataDeletionWorker,
  createProviderDataDeletionWorker,
} from "./provider-data-deletion.worker.js";
import { closeProviderDataDeletionQueue } from "./provider-data-deletion-queue.js";
import {
  closeTbcRefundWorker,
  createTbcRefundWorker,
} from "./tbc-refund.worker.js";
import { closeTbcRefundQueue } from "./tbc-refund-queue.js";
import {
  closeFlittRefundWorker,
  createFlittRefundWorker,
} from "./flitt-refund.worker.js";
import { closeFlittRefundQueue } from "./flitt-refund-queue.js";
import { getWorkerEnv } from "./config/env.js";
import {
  closeMurekaProviderJobWorker,
  createMurekaProviderJobWorker,
} from "./mureka-provider-job.worker.js";
import { startMurekaWorkerListenHeartbeat } from "./mureka-worker-listen-heartbeat.js";
import {
  closeMurekaProviderJobQueue,
  getMurekaProviderJobQueue,
} from "./mureka-provider-job-queue.js";
import { startMurekaProviderJobReconciler } from "./mureka-provider-job-reconciler.js";

const QUEUE_METRICS_INTERVAL_MS = 60_000;

async function refreshWorkerQueueDepthGauges(): Promise<void> {
  const [providerCounts, murekaCounts, persistCounts] = await Promise.all([
    getProviderJobQueue().getJobCounts("waiting", "delayed"),
    getMurekaProviderJobQueue().getJobCounts("waiting", "delayed"),
    getMusicTrackPersistenceQueue().getJobCounts("waiting", "delayed"),
  ]);
  musicGenerationQueueDepth.set(
    (providerCounts.waiting ?? 0) +
      (providerCounts.delayed ?? 0) +
      (murekaCounts.waiting ?? 0) +
      (murekaCounts.delayed ?? 0),
  );
  musicPersistenceQueueDepth.set((persistCounts.waiting ?? 0) + (persistCounts.delayed ?? 0));
}

/** Startup snapshot of the Mureka wiring — presence only, never secret values. */
function logMurekaWorkerConfig(
  env: ReturnType<typeof getWorkerEnv>,
  listenEnabled: boolean,
): void {
  const flags = resolveMurekaFeatureFlags(process.env);
  logLoadControl("mureka_worker_config", {
    provider: "mureka",
    queue: MUREKA_PROVIDER_JOB_QUEUE_NAME,
    enabled: env.MUREKA_ENABLED,
    personalVoiceEnabled: env.MUREKA_PERSONAL_VOICE_ENABLED,
    productionRolloutEnabled: flags.productionRolloutEnabled,
    hasApiKey: Boolean(env.MUREKA_API_KEY),
    baseUrlConfigured: flags.baseUrlConfigured,
    baseUrlValid: flags.baseUrlValid,
    protocol: flags.baseUrlProtocol,
    hostname: flags.baseUrlHostname,
    model: env.MUREKA_MODEL,
    concurrency: env.MUREKA_WORKER_CONCURRENCY,
    defaultMusicProvider: env.MUSIC_DEFAULT_PROVIDER ?? env.MUSIC_PROVIDER,
    reconcilerEnabled: env.WORKER_PROVIDER_RECONCILER_ENABLED,
    murekaQueueListenEnabled: listenEnabled,
  });
}

async function main() {
  const env = getWorkerEnv();
  startDefaultProcessMetrics("worker");

  let metricsServer: ReturnType<typeof startMetricsHttpServer> | null = null;

  if (env.WORKER_METRICS_ENABLED) {
    metricsServer = startMetricsHttpServer({
      host: env.WORKER_METRICS_HOST,
      port: env.WORKER_METRICS_PORT,
      bearerToken: env.METRICS_BEARER_TOKEN,
      enabled: true,
    });
    console.log(
      `Worker metrics listening on http://${env.WORKER_METRICS_HOST}:${env.WORKER_METRICS_PORT}/metrics`,
    );
  }

  logStorageConfig();

  const murekaListenEnabled = canListenMurekaProviderJobs(process.env);
  logMurekaWorkerConfig(env, murekaListenEnabled);

  if (env.MUREKA_ENABLED && !murekaListenEnabled) {
    logLoadControl(
      "mureka_worker_config",
      {
        provider: "mureka",
        queue: MUREKA_PROVIDER_JOB_QUEUE_NAME,
        murekaQueueListenEnabled: false,
        reason: "invalid_base_url_or_missing_api_key",
        baseUrlValid: resolveMurekaFeatureFlags(process.env).baseUrlValid,
        hasApiKey: Boolean(env.MUREKA_API_KEY),
      },
      "error",
    );
  }

  const generationWorker = createGenerationWorker();
  const providerJobWorker = createProviderJobWorker();
  const murekaProviderJobWorker: Worker<MurekaProviderJobPayload> | null =
    murekaListenEnabled ? createMurekaProviderJobWorker() : null;
  const murekaHeartbeat = murekaListenEnabled
    ? await startMurekaWorkerListenHeartbeat()
    : null;
  const trackPersistWorker = createMusicTrackPersistenceWorker();
  const providerDataDeletionWorker = createProviderDataDeletionWorker();
  // Legacy TBC refund handler — historical CreditPackPurchase.provider=tbc only.
  const tbcRefundWorker = createTbcRefundWorker();
  const flittRefundWorker = createFlittRefundWorker();

  generationWorker.on("completed", (job) => {
    console.log(`Generation job completed: ${job.id}`);
  });

  generationWorker.on("failed", (job, error) => {
    console.error(`Generation job failed: ${job?.id ?? "unknown"}`, error);
  });

  providerJobWorker.on("completed", (job) => {
    console.log(`Provider job completed: ${job.id}`);
  });

  providerJobWorker.on("failed", (job, error) => {
    console.error(`Provider job failed: ${job?.id ?? "unknown"}`, error);
  });

  if (murekaProviderJobWorker) {
    murekaProviderJobWorker.on("completed", (job, result) => {
      const outcome =
        result && typeof result === "object" && "outcome" in result
          ? String((result as { outcome: string }).outcome)
          : "unknown";
      console.log(
        `Mureka provider job finished: ${job.id} outcome=${outcome}`,
      );
    });

    murekaProviderJobWorker.on("failed", (job, error) => {
      console.error(
        `Mureka provider job retry/failed: ${job?.id ?? "unknown"}`,
        error,
      );
    });
  }

  trackPersistWorker.on("completed", (job) => {
    console.log(`Track persist job completed: ${job.id}`);
  });

  trackPersistWorker.on("failed", (job, error) => {
    console.error(`Track persist job failed: ${job?.id ?? "unknown"}`, error);
  });

  providerDataDeletionWorker.on("completed", (job) => {
    console.log(`Provider data deletion submit completed: ${job.id}`);
  });

  providerDataDeletionWorker.on("failed", (job, error) => {
    console.error(
      `Provider data deletion submit failed: ${job?.id ?? "unknown"}`,
      error,
    );
  });

  tbcRefundWorker.on("completed", (job) => {
    console.log(`TBC refund job completed: ${job.id}`);
  });

  tbcRefundWorker.on("failed", (job, error) => {
    console.error(`TBC refund job failed: ${job?.id ?? "unknown"}`, error);
  });

  flittRefundWorker.on("completed", (job) => {
    console.log(`Flitt refund job completed: ${job.id}`);
  });

  flittRefundWorker.on("failed", (job, error) => {
    console.error(`Flitt refund job failed: ${job?.id ?? "unknown"}`, error);
  });

  console.log(
    murekaListenEnabled
      ? "Worker started (generation + provider-jobs + mureka-provider-jobs + music-track-persistence + provider-data-deletion + tbc-refund + flitt-refund)"
      : "Worker started (generation + provider-jobs + music-track-persistence + provider-data-deletion + tbc-refund + flitt-refund; mureka queue disabled)",
  );

  const tickMetrics = () => {
    void logProviderQueueMetrics();
    void refreshWorkerQueueDepthGauges().catch(() => undefined);
  };

  tickMetrics();
  const metricsTimer = setInterval(tickMetrics, QUEUE_METRICS_INTERVAL_MS);
  const reconcilerTimer = startProviderJobReconciler();
  const murekaReconcilerTimer = murekaListenEnabled
    ? startMurekaProviderJobReconciler()
    : null;
  const trackPersistReconcilerTimer = startMusicTrackPersistenceReconciler();

  const shutdown = async () => {
    clearInterval(metricsTimer);
    if (reconcilerTimer) {
      clearInterval(reconcilerTimer);
    }
    if (murekaReconcilerTimer) {
      clearInterval(murekaReconcilerTimer);
    }
    if (trackPersistReconcilerTimer) {
      clearInterval(trackPersistReconcilerTimer);
    }

    // Stop workers/queues before metrics HTTP so scrapes don't hit a half-dead process.
    await closeGenerationWorker(generationWorker);
    await closeProviderJobWorker(providerJobWorker);
    if (murekaProviderJobWorker) {
      await closeMurekaProviderJobWorker(murekaProviderJobWorker);
    }
    if (murekaHeartbeat) {
      await murekaHeartbeat.stop();
    }
    await closeMusicTrackPersistenceWorker(trackPersistWorker);
    await closeProviderDataDeletionWorker(providerDataDeletionWorker);
    await closeTbcRefundWorker(tbcRefundWorker);
    await closeFlittRefundWorker(flittRefundWorker);
    await closeProviderJobQueue();
    await closeMurekaProviderJobQueue();
    await closeMusicTrackPersistenceQueue();
    await closeProviderDataDeletionQueue();
    await closeTbcRefundQueue();
    await closeFlittRefundQueue();
    await closeProviderQueueMetrics();

    if (metricsServer) {
      await new Promise<void>((resolve, reject) => {
        metricsServer!.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }).catch(() => undefined);
    }

    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

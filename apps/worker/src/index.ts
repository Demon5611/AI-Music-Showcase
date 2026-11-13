import "./common/load-env.js";
import {
  musicGenerationQueueDepth,
  musicPersistenceQueueDepth,
  startDefaultProcessMetrics,
  startMetricsHttpServer,
} from "@ai-music/observability";
import {
  canListenAudioengineProviderJobs,
} from "@ai-music/ai-providers";
import {
  logLoadControl,
  AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
  resolveAudioengineFeatureFlags,
  type AudioengineProviderJobPayload,
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
  closeLegacygatewayRefundWorker,
  createLegacygatewayRefundWorker,
} from "./legacygateway-refund.worker.js";
import { closeLegacygatewayRefundQueue } from "./legacygateway-refund-queue.js";
import {
  closeCheckoutgatewayRefundWorker,
  createCheckoutgatewayRefundWorker,
} from "./checkoutgateway-refund.worker.js";
import { closeCheckoutgatewayRefundQueue } from "./checkoutgateway-refund-queue.js";
import { getWorkerEnv } from "./config/env.js";
import {
  closeAudioengineProviderJobWorker,
  createAudioengineProviderJobWorker,
} from "./audioengine-provider-job.worker.js";
import { startAudioengineWorkerListenHeartbeat } from "./audioengine-worker-listen-heartbeat.js";
import {
  closeAudioengineProviderJobQueue,
  getAudioengineProviderJobQueue,
} from "./audioengine-provider-job-queue.js";
import { startAudioengineProviderJobReconciler } from "./audioengine-provider-job-reconciler.js";

const QUEUE_METRICS_INTERVAL_MS = 60_000;

async function refreshWorkerQueueDepthGauges(): Promise<void> {
  const [providerCounts, audioengineCounts, persistCounts] = await Promise.all([
    getProviderJobQueue().getJobCounts("waiting", "delayed"),
    getAudioengineProviderJobQueue().getJobCounts("waiting", "delayed"),
    getMusicTrackPersistenceQueue().getJobCounts("waiting", "delayed"),
  ]);
  musicGenerationQueueDepth.set(
    (providerCounts.waiting ?? 0) +
      (providerCounts.delayed ?? 0) +
      (audioengineCounts.waiting ?? 0) +
      (audioengineCounts.delayed ?? 0),
  );
  musicPersistenceQueueDepth.set((persistCounts.waiting ?? 0) + (persistCounts.delayed ?? 0));
}

/** Startup snapshot of the Audioengine wiring — presence only, never secret values. */
function logAudioengineWorkerConfig(
  env: ReturnType<typeof getWorkerEnv>,
  listenEnabled: boolean,
): void {
  const flags = resolveAudioengineFeatureFlags(process.env);
  logLoadControl("audioengine_worker_config", {
    provider: "audioengine",
    queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
    enabled: env.AUDIOENGINE_ENABLED,
    personalVoiceEnabled: env.AUDIOENGINE_PERSONAL_VOICE_ENABLED,
    productionRolloutEnabled: flags.productionRolloutEnabled,
    hasApiKey: Boolean(env.AUDIOENGINE_API_KEY),
    baseUrlConfigured: flags.baseUrlConfigured,
    baseUrlValid: flags.baseUrlValid,
    protocol: flags.baseUrlProtocol,
    hostname: flags.baseUrlHostname,
    model: env.AUDIOENGINE_MODEL,
    concurrency: env.AUDIOENGINE_WORKER_CONCURRENCY,
    defaultMusicProvider: env.MUSIC_DEFAULT_PROVIDER ?? env.MUSIC_PROVIDER,
    reconcilerEnabled: env.WORKER_PROVIDER_RECONCILER_ENABLED,
    audioengineQueueListenEnabled: listenEnabled,
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

  const audioengineListenEnabled = canListenAudioengineProviderJobs(process.env);
  logAudioengineWorkerConfig(env, audioengineListenEnabled);

  if (env.AUDIOENGINE_ENABLED && !audioengineListenEnabled) {
    logLoadControl(
      "audioengine_worker_config",
      {
        provider: "audioengine",
        queue: AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
        audioengineQueueListenEnabled: false,
        reason: "invalid_base_url_or_missing_api_key",
        baseUrlValid: resolveAudioengineFeatureFlags(process.env).baseUrlValid,
        hasApiKey: Boolean(env.AUDIOENGINE_API_KEY),
      },
      "error",
    );
  }

  const generationWorker = createGenerationWorker();
  const providerJobWorker = createProviderJobWorker();
  const audioengineProviderJobWorker: Worker<AudioengineProviderJobPayload> | null =
    audioengineListenEnabled ? createAudioengineProviderJobWorker() : null;
  const audioengineHeartbeat = audioengineListenEnabled
    ? await startAudioengineWorkerListenHeartbeat()
    : null;
  const trackPersistWorker = createMusicTrackPersistenceWorker();
  const providerDataDeletionWorker = createProviderDataDeletionWorker();
  // Legacy LEGACYGATEWAY refund handler — historical CreditPackPurchase.provider=legacygateway only.
  const legacygatewayRefundWorker = createLegacygatewayRefundWorker();
  const checkoutgatewayRefundWorker = createCheckoutgatewayRefundWorker();

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

  if (audioengineProviderJobWorker) {
    audioengineProviderJobWorker.on("completed", (job, result) => {
      const outcome =
        result && typeof result === "object" && "outcome" in result
          ? String((result as { outcome: string }).outcome)
          : "unknown";
      console.log(
        `Audioengine provider job finished: ${job.id} outcome=${outcome}`,
      );
    });

    audioengineProviderJobWorker.on("failed", (job, error) => {
      console.error(
        `Audioengine provider job retry/failed: ${job?.id ?? "unknown"}`,
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

  legacygatewayRefundWorker.on("completed", (job) => {
    console.log(`LEGACYGATEWAY refund job completed: ${job.id}`);
  });

  legacygatewayRefundWorker.on("failed", (job, error) => {
    console.error(`LEGACYGATEWAY refund job failed: ${job?.id ?? "unknown"}`, error);
  });

  checkoutgatewayRefundWorker.on("completed", (job) => {
    console.log(`Checkoutgateway refund job completed: ${job.id}`);
  });

  checkoutgatewayRefundWorker.on("failed", (job, error) => {
    console.error(`Checkoutgateway refund job failed: ${job?.id ?? "unknown"}`, error);
  });

  console.log(
    audioengineListenEnabled
      ? "Worker started (generation + provider-jobs + audioengine-provider-jobs + music-track-persistence + provider-data-deletion + legacygateway-refund + checkoutgateway-refund)"
      : "Worker started (generation + provider-jobs + music-track-persistence + provider-data-deletion + legacygateway-refund + checkoutgateway-refund; audioengine queue disabled)",
  );

  const tickMetrics = () => {
    void logProviderQueueMetrics();
    void refreshWorkerQueueDepthGauges().catch(() => undefined);
  };

  tickMetrics();
  const metricsTimer = setInterval(tickMetrics, QUEUE_METRICS_INTERVAL_MS);
  const reconcilerTimer = startProviderJobReconciler();
  const audioengineReconcilerTimer = audioengineListenEnabled
    ? startAudioengineProviderJobReconciler()
    : null;
  const trackPersistReconcilerTimer = startMusicTrackPersistenceReconciler();

  const shutdown = async () => {
    clearInterval(metricsTimer);
    if (reconcilerTimer) {
      clearInterval(reconcilerTimer);
    }
    if (audioengineReconcilerTimer) {
      clearInterval(audioengineReconcilerTimer);
    }
    if (trackPersistReconcilerTimer) {
      clearInterval(trackPersistReconcilerTimer);
    }

    // Stop workers/queues before metrics HTTP so scrapes don't hit a half-dead process.
    await closeGenerationWorker(generationWorker);
    await closeProviderJobWorker(providerJobWorker);
    if (audioengineProviderJobWorker) {
      await closeAudioengineProviderJobWorker(audioengineProviderJobWorker);
    }
    if (audioengineHeartbeat) {
      await audioengineHeartbeat.stop();
    }
    await closeMusicTrackPersistenceWorker(trackPersistWorker);
    await closeProviderDataDeletionWorker(providerDataDeletionWorker);
    await closeLegacygatewayRefundWorker(legacygatewayRefundWorker);
    await closeCheckoutgatewayRefundWorker(checkoutgatewayRefundWorker);
    await closeProviderJobQueue();
    await closeAudioengineProviderJobQueue();
    await closeMusicTrackPersistenceQueue();
    await closeProviderDataDeletionQueue();
    await closeLegacygatewayRefundQueue();
    await closeCheckoutgatewayRefundQueue();
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

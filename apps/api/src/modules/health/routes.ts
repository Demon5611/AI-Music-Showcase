import type { FastifyInstance } from "fastify";
import {
  prometheusContentType,
  renderPrometheusMetrics,
  startDefaultProcessMetrics,
} from "@ai-music/observability";
import {
  GENERATION_QUEUE_NAME,
  MUSIC_TRACK_PERSISTENCE_QUEUE_NAME,
  PROVIDER_JOB_QUEUE_NAME,
} from "@ai-music/shared";
import { getApiEnv } from "../../config/env.js";
import { assertOpsAdmin } from "../../common/ops-auth.js";
import { sendAppError } from "../../common/errors.js";
import { getProviderQueueMetrics } from "../queue/provider-queue-metrics.js";
import { getGenerationQueue } from "../queue/generation-queue.js";
import { getProviderJobQueue } from "../queue/provider-job-queue.js";
import { getMusicTrackPersistenceQueue } from "../queue/music-track-persistence-queue.js";
import { refreshQueueDepthGauges } from "../queue/queue-depth-gauges.js";
import { runDependencyChecks } from "./health-checks.js";
import { getLoadTestSummary } from "../music/load-test-summary.service.js";

export async function registerHealthRoutes(app: FastifyInstance) {
  const env = getApiEnv();
  startDefaultProcessMetrics("api");

  app.get("/health", async (request) => {
    const checks = await runDependencyChecks(env.REDIS_URL, request.log);
    const healthy = checks.db && checks.redis;

    return {
      status: healthy ? "ok" : "degraded",
      checks,
    };
  });

  app.get("/health/ready", async (request, reply) => {
    const checks = await runDependencyChecks(env.REDIS_URL, request.log);
    const ready = checks.db && checks.redis;

    return reply.status(ready ? 200 : 503).send({
      status: ready ? "ready" : "degraded",
      checks,
      time: new Date().toISOString(),
    });
  });

  app.get("/metrics", async (request, reply) => {
    if (!env.METRICS_ENABLED) {
      return reply.status(404).type("text/plain; charset=utf-8").send("Not Found");
    }

    // Staging + production: bearer required (fail closed if misconfigured).
    // Development: open unless METRICS_BEARER_TOKEN is set.
    if (env.isDeployed && !env.METRICS_BEARER_TOKEN) {
      return reply.status(503).type("text/plain; charset=utf-8").send("Metrics misconfigured");
    }

    if (env.isDeployed || env.METRICS_BEARER_TOKEN) {
      const header = request.headers.authorization;
      const token =
        typeof header === "string" ? /^Bearer\s+(.+)$/i.exec(header.trim())?.[1]?.trim() : null;

      if (!token || token !== env.METRICS_BEARER_TOKEN) {
        return reply.status(401).type("text/plain; charset=utf-8").send("Unauthorized");
      }
    }

    await refreshQueueDepthGauges().catch(() => undefined);
    const body = await renderPrometheusMetrics();
    return reply.type(prometheusContentType()).send(body);
  });

  app.get("/api/music/ops/status", async (request, reply) => {
    try {
      assertOpsAdmin(request);
      const providerQueue = await getProviderQueueMetrics();
      const generationCounts = await getGenerationQueue().getJobCounts(
        "waiting",
        "active",
        "failed",
        "delayed",
      );
      const providerCounts = await getProviderJobQueue().getJobCounts(
        "waiting",
        "active",
        "failed",
        "delayed",
      );
      const persistCounts = await getMusicTrackPersistenceQueue().getJobCounts(
        "waiting",
        "active",
        "failed",
        "delayed",
      );

      return reply.send({
        queues: {
          [GENERATION_QUEUE_NAME]: generationCounts,
          [PROVIDER_JOB_QUEUE_NAME]: providerCounts,
          [MUSIC_TRACK_PERSISTENCE_QUEUE_NAME]: persistCounts,
        },
        providerQueue,
        loadControl: {
          backpressure: providerQueue.waiting >= 80,
          threshold: 80,
        },
      });
    } catch (error) {
      return sendAppError(reply, error);
    }
  });

  app.post<{ Body: { recordIds?: unknown } }>(
    "/api/music/ops/load-test-summary",
    async (request, reply) => {
      try {
        assertOpsAdmin(request);
        const summary = await getLoadTestSummary({
          recordIds: Array.isArray(request.body?.recordIds)
            ? (request.body.recordIds as string[])
            : [],
        });
        return reply.send(summary);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );
}

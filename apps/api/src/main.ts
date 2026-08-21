import "./common/load-env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { fileURLToPath } from "node:url";
import { registerRequestIdPlugin } from "./common/request-id.js";
import { initApiSentry } from "./common/sentry.js";
import { registerWebhookRawBody } from "./common/webhook-raw-body.js";
import { isAppError } from "./common/errors.js";
import { registerRateLimitPlugin } from "./common/rate-limit.js";
import { registerAuthPlugin } from "./modules/auth/plugin.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerClerkWebhookRoutes } from "./modules/auth/clerk-webhook.routes.js";
import { registerResendInboundWebhookRoutes } from "./modules/resend-inbound/routes.js";
import { registerUserRoutes } from "./modules/users/routes.js";
import { registerVoiceSampleRoutes } from "./modules/voice-samples/routes.js";
import { registerVoiceProfileRoutes } from "./modules/voice-profiles/routes.js";
import { registerGenerationRoutes } from "./modules/generations/routes.js";
import { registerTrackRoutes } from "./modules/tracks/routes.js";
import { registerCreditsRoutes } from "./modules/credits/routes.js";
import { registerBillingRoutes } from "./modules/billing/routes.js";
import { registerRefundRoutes } from "./modules/billing/refund.routes.js";
import { registerAccountDeletionRoutes } from "./modules/account-deletion/routes.js";
import { registerStorageRoutes } from "./modules/storage/routes.js";
import { logStorageConfig } from "./modules/storage/storage-config.js";
import { registerMusicRoutes } from "./modules/music/routes.js";
import { registerMusicEditorRoutes } from "./modules/music-editor/routes.js";
import { registerHealthRoutes } from "./modules/health/routes.js";
import { getApiEnv } from "./config/env.js";
import { closeGenerationQueue } from "./modules/queue/generation-queue.js";
import { closeProviderJobQueue } from "./modules/queue/provider-job-queue.js";
import { closeMurekaProviderJobQueue } from "./modules/queue/mureka-provider-job-queue.js";
import { closeTbcRefundQueue } from "./modules/queue/tbc-refund-queue.js";
import {
  startLoadControlMetricsPolling,
  stopLoadControlMetricsPolling,
} from "./modules/queue/load-control-metrics-polling.js";

const port = Number(process.env.API_PORT ?? 3001);

function normalizeWebOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, "");
}

export async function buildApp() {
  initApiSentry();
  const app = Fastify({ logger: true });
  const env = getApiEnv();

  await registerRequestIdPlugin(app);

  await app.register(cors, {
    origin: [normalizeWebOrigin(env.WEB_ORIGIN)],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
  });

  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 },
  });

  await registerWebhookRawBody(app);

  await registerRateLimitPlugin(app);

  await registerAuthPlugin(app);

  await registerHealthRoutes(app);

  await registerAuthRoutes(app);
  await registerClerkWebhookRoutes(app);
  await registerResendInboundWebhookRoutes(app);
  await registerUserRoutes(app);
  await registerVoiceSampleRoutes(app);
  await registerVoiceProfileRoutes(app);
  await registerGenerationRoutes(app);
  await registerTrackRoutes(app);
  await registerCreditsRoutes(app);
  await registerBillingRoutes(app);
  await registerRefundRoutes(app);
  await registerAccountDeletionRoutes(app);
  await registerStorageRoutes(app);
  await registerMusicRoutes(app);
  await registerMusicEditorRoutes(app);

  app.setErrorHandler((error, _request, reply) => {
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
      });
    }

    app.log.error(error);
    return reply.status(500).send({ error: "Internal Server Error" });
  });

  return app;
}

async function main() {
  const app = await buildApp();
  logStorageConfig();
  startLoadControlMetricsPolling();

  const shutdown = async () => {
    stopLoadControlMetricsPolling();
    await closeGenerationQueue();
    await closeProviderJobQueue();
    await closeMurekaProviderJobQueue();
    await closeTbcRefundQueue();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port, host: "0.0.0.0" });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

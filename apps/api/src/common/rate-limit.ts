import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { Redis } from "ioredis";
import { getApiEnv } from "../config/env.js";

const ONE_MINUTE_MS = 60_000;

export const RATE_LIMITS = {
  voicePrepare: { max: 6, timeWindowMs: ONE_MINUTE_MS },
  voiceVerify: { max: 5, timeWindowMs: ONE_MINUTE_MS },
  musicGenerate: { max: 10, timeWindowMs: ONE_MINUTE_MS },
  signedUrl: { max: 12, timeWindowMs: ONE_MINUTE_MS },
  billingCheckout: { max: 5, timeWindowMs: ONE_MINUTE_MS },
  billingPricingFx: { max: 30, timeWindowMs: ONE_MINUTE_MS },
  sunoCallback: { max: 120, timeWindowMs: ONE_MINUTE_MS },
} as const;

function resolveRateLimitKey(request: FastifyRequest): string {
  return request.userId ?? request.ip;
}

export function userRateLimitRouteConfig(
  max: number,
  timeWindowMs: number,
): {
  rateLimit: {
    max: number;
    timeWindow: number;
    keyGenerator: typeof resolveRateLimitKey;
  };
} {
  return {
    rateLimit: {
      max,
      timeWindow: timeWindowMs,
      keyGenerator: resolveRateLimitKey,
    },
  };
}

export async function registerRateLimitPlugin(app: FastifyInstance) {
  const env = getApiEnv();
  const redisUrl = process.env.REDIS_URL?.trim();
  let redis: Redis | undefined;

  if (env.isDeployed && redisUrl) {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    app.addHook("onClose", async () => {
      await redis?.quit();
    });
  }

  await app.register(rateLimit, {
    global: false,
    hook: "preHandler",
    redis,
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: "Слишком много запросов. Подождите немного и попробуйте снова.",
      code: "RATE_LIMITED",
      retryAfterMs: context.ttl,
    }),
  });
}

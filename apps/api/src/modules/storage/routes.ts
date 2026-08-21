import type { FastifyInstance } from "fastify";
import { createSignedReadUrlSchema } from "@ai-music/shared";
import { RATE_LIMITS, userRateLimitRouteConfig } from "../../common/rate-limit.js";
import { requireAuth } from "../../common/require-auth.js";
import { sendAppError } from "../../common/errors.js";
import { createSignedReadUrl } from "./storage.service.js";
import { getApiEnv } from "../../config/env.js";
import { resolveOwnedStorageKey } from "./resolve-owned-storage-key.js";

export async function registerStorageRoutes(app: FastifyInstance) {
  app.post(
    "/api/storage/signed-url",
    {
      config: userRateLimitRouteConfig(
        RATE_LIMITS.signedUrl.max,
        RATE_LIMITS.signedUrl.timeWindowMs,
      ),
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const parsed = createSignedReadUrlSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      try {
        const env = getApiEnv();
        const ttl = env.R2_SIGNED_URL_TTL_SECONDS;
        const owned = await resolveOwnedStorageKey(request.userId!, parsed.data);
        const url = await createSignedReadUrl(owned.key, ttl);

        return reply.send({
          url,
          expiresInSec: ttl,
          resourceType: owned.resourceType,
          resourceId: owned.resourceId,
        });
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );
}

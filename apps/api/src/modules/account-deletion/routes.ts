import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../common/require-auth.js";
import { sendAppError } from "../../common/errors.js";
import {
  getAccountDeletionState,
  requestAccountDeletion,
} from "./account-deletion.service.js";

export async function registerAccountDeletionRoutes(app: FastifyInstance) {
  app.get(
    "/api/account/deletion",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const state = await getAccountDeletionState(request.userId!);
        return reply.send(state);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.post(
    "/api/account/deletion",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const body = (request.body ?? {}) as { locale?: string };
        const locale = body.locale === "en" ? "en" : "ru";
        const state = await requestAccountDeletion(request.userId!, { locale });
        return reply.send(state);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );
}

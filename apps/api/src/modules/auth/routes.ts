import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../common/require-auth.js";
import { sendAppError } from "../../common/errors.js";
import { getCurrentUser } from "./service.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get(
    "/api/auth/session",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const user = await getCurrentUser(request.userId!);
        return reply.send(user);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );
}

import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../common/require-auth.js";
import { sendAppError } from "../../common/errors.js";
import { getCreditsBalance } from "./service.js";

export async function registerCreditsRoutes(app: FastifyInstance) {
  app.get(
    "/api/credits/balance",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const balance = await getCreditsBalance(request.userId!);
        return reply.send({ balance });
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );
}

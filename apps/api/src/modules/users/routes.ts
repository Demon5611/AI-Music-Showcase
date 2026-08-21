import type { FastifyInstance } from "fastify";
import type { VocalGender } from "@ai-music/shared";
import { isVocalGender } from "@ai-music/shared";
import { requireAuth } from "../../common/require-auth.js";
import { sendAppError } from "../../common/errors.js";
import { getCurrentUser } from "../auth/service.js";
import { updateUserVocalGender } from "./service.js";

interface UpdateMeBody {
  vocalGender?: VocalGender;
}

export async function registerUserRoutes(app: FastifyInstance) {
  app.get(
    "/api/users/me",
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

  app.patch<{ Body: UpdateMeBody }>(
    "/api/users/me",
    { preHandler: requireAuth },
    async (request, reply) => {
      const vocalGender = request.body?.vocalGender;

      if (!isVocalGender(vocalGender)) {
        return reply.status(400).send({ error: "vocalGender must be m or f" });
      }

      try {
        const user = await updateUserVocalGender(request.userId!, vocalGender);
        return reply.send(user);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );
}

import type { FastifyInstance } from "fastify";
import { createGenerationSchema } from "@ai-music/shared";
import { requireAuth } from "../../common/require-auth.js";
import { sendAppError } from "../../common/errors.js";
import {
  createGenerationJob,
  getGenerationJob,
  getGenerationJobStatus,
} from "./service.js";

export async function registerGenerationRoutes(app: FastifyInstance) {
  app.post(
    "/api/generations",
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = createGenerationSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      try {
        const result = await createGenerationJob(
          request.userId!,
          parsed.data,
        );
        return reply.status(201).send(result);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/generations/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const job = await getGenerationJob(request.userId!, request.params.id);
        return reply.send(job);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/generations/:id/status",
    { preHandler: requireAuth },
    async (request, reply) => {
      try {
        const status = await getGenerationJobStatus(
          request.userId!,
          request.params.id,
        );
        return reply.send(status);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );
}

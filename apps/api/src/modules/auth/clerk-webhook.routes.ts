import type { FastifyInstance } from "fastify";
import { sendAppError } from "../../common/errors.js";
import { handleClerkWebhook } from "./clerk-webhook.service.js";

export async function registerClerkWebhookRoutes(app: FastifyInstance) {
  app.post("/api/auth/clerk/webhook", { config: { rawBody: true } }, async (request, reply) => {
    const rawBody = request.rawBody;

    if (!rawBody) {
      return reply.status(400).send({ error: "Missing raw body" });
    }

    try {
      const result = await handleClerkWebhook(rawBody.toString("utf8"), request.headers, request.log);
      return reply.send(result);
    } catch (error) {
      return sendAppError(reply, error);
    }
  });
}

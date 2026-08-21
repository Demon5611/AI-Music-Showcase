import type { FastifyInstance } from "fastify";
import { sendAppError } from "../../common/errors.js";
import { handleResendInboundWebhook } from "./resend-inbound.service.js";

export async function registerResendInboundWebhookRoutes(app: FastifyInstance) {
  app.post(
    "/api/webhooks/resend/inbound",
    { config: { rawBody: true } },
    async (request, reply) => {
      const rawBody = request.rawBody;

      if (!rawBody) {
        return reply.status(400).send({ error: "Missing raw body" });
      }

      try {
        const result = await handleResendInboundWebhook(
          rawBody.toString("utf8"),
          request.headers,
          request.log,
        );
        return reply.send(result);
      } catch (error) {
        return sendAppError(reply, error);
      }
    },
  );
}

import type { FastifyInstance, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

const RAW_BODY_WEBHOOK_PATHS = new Set([
  "/api/auth/clerk/webhook",
  "/api/webhooks/resend/inbound",
]);

/**
 * Preserve raw JSON body for webhook signature verification (Clerk, Resend).
 */
export async function registerWebhookRawBody(app: FastifyInstance) {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request: FastifyRequest, body: Buffer, done) => {
      if (RAW_BODY_WEBHOOK_PATHS.has(request.url.split("?")[0] ?? request.url)) {
        request.rawBody = body;
      }

      try {
        const json = body.length > 0 ? JSON.parse(body.toString("utf8")) : {};
        done(null, json);
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );
}

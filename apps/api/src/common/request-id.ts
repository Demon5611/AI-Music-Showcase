import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const HEADER = "x-request-id";

export async function registerRequestIdPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const incoming = request.headers[HEADER];
    const requestId =
      typeof incoming === "string" && incoming.trim().length > 0
        ? incoming.trim()
        : randomUUID();

    request.requestId = requestId;
    reply.header(HEADER, requestId);
  });
}

declare module "fastify" {
  interface FastifyRequest {
    requestId?: string;
  }
}

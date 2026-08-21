import type { FastifyReply, FastifyRequest } from "fastify";
import { logSecurityEvent } from "./security-log.js";

/**
 * Server-side admin gate. Source of truth: Clerk publicMetadata.role === "admin".
 * Must run after requireAuth (or ensure userId is set).
 * OPS_ADMIN_TOKEN is NOT used here — that stays for ops/internal endpoints only.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.userId) {
    logSecurityEvent("authorization_denied", {
      reason: "unauthenticated",
      route: request.url,
    });
    return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
  }

  if (request.authRole !== "admin") {
    logSecurityEvent("authorization_denied", {
      reason: "admin_required",
      actorUserId: request.userId,
      role: request.authRole ?? "user",
      route: request.url,
    });
    return reply.status(403).send({ error: "Forbidden", code: "ADMIN_REQUIRED" });
  }
}

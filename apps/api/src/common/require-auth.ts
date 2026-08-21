import type { FastifyReply, FastifyRequest } from "fastify";

const ALLOWED_WHILE_DELETION_PENDING = [
  "/api/account/deletion",
  "/api/users/me",
  "/api/auth/me",
];

function isAllowedDuringAccountDeletion(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return ALLOWED_WHILE_DELETION_PENDING.some(
    (allowed) => path === allowed || path.endsWith(allowed),
  );
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.userId) {
    return reply.status(401).send({ error: "Unauthorized", code: "UNAUTHORIZED" });
  }

  if (
    request.accountDeletionBlocked &&
    !isAllowedDuringAccountDeletion(request.url)
  ) {
    return reply.status(403).send({
      error: "Account deletion is in progress",
      code: "ACCOUNT_DELETION_PENDING",
    });
  }
}

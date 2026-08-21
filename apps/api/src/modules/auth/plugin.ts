import type { FastifyInstance } from "fastify";
import { AccountDeletionPendingError } from "../../common/errors.js";
import { createAuthVerifier } from "./create-auth-verifier.js";
import { syncAuthUser } from "./sync-auth-user.js";
import type { AuthRole } from "./types.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    /** Clerk publicMetadata.role — server-side only. */
    authRole?: AuthRole;
    /** Set when Clerk JWT is valid but account deletion blocks product use. */
    accountDeletionBlocked?: boolean;
  }
}

export async function registerAuthPlugin(app: FastifyInstance) {
  const verifier = createAuthVerifier();

  app.addHook("onRequest", async (request) => {
    const header = request.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      return;
    }

    const token = header.slice("Bearer ".length).trim();
    const identity = await verifier.verify(token);

    if (!identity) {
      return;
    }

    try {
      await syncAuthUser(identity, request.log);
      request.userId = identity.userId;
      request.authRole = identity.role;
      request.accountDeletionBlocked = false;
    } catch (error) {
      if (error instanceof AccountDeletionPendingError) {
        request.userId = identity.userId;
        request.authRole = identity.role;
        request.accountDeletionBlocked = true;
        return;
      }

      request.log.error(
        { err: error, userId: identity.userId },
        "Failed to sync auth user",
      );
    }
  });
}

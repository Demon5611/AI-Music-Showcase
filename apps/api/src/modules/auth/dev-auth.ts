import type { AuthIdentity, AuthRole, AuthVerifier } from "./types.js";
import { resolveAuthRole } from "./types.js";

const DEV_TOKEN_PREFIX = "dev:";

function resolveDevRole(): AuthRole {
  return resolveAuthRole({ role: process.env.AUTH_DEV_USER_ROLE?.trim() });
}

export function createDevAuthVerifier(): AuthVerifier {
  return {
    async verify(token: string): Promise<AuthIdentity | null> {
      if (!token.startsWith(DEV_TOKEN_PREFIX)) {
        return null;
      }

      const userId = token.slice(DEV_TOKEN_PREFIX.length).trim();

      if (!userId) {
        return null;
      }

      return {
        userId,
        email: process.env.AUTH_DEV_USER_EMAIL ?? `${userId}@dev.local`,
        name: process.env.AUTH_DEV_USER_NAME ?? "Dev User",
        role: resolveDevRole(),
      };
    },
  };
}

/** Dev tokens are never accepted in staging or production. */
export function isDevAuthEnabled(): boolean {
  const appEnv = process.env.APP_ENV?.trim() || "development";

  if (appEnv === "staging" || appEnv === "production") {
    return false;
  }

  if (process.env.AUTH_DEV_MODE === "true") {
    return true;
  }

  if (!process.env.CLERK_SECRET_KEY) {
    return true;
  }

  return appEnv === "development";
}

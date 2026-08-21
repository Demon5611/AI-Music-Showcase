import { createClerkClient, verifyToken } from "@clerk/backend";
import {
  TokenVerificationError,
  isClerkAPIResponseError,
} from "@clerk/backend/errors";
import type { AuthIdentity, AuthVerifier } from "./types.js";
import { resolveAuthRole } from "./types.js";
import {
  createClerkAuthLogger,
  resolveClerkSecretKeyKind,
  type ClerkAuthLogger,
} from "./clerk-auth-log.js";

type VerifyTokenFn = typeof verifyToken;

type ClerkUsersClient = {
  users: {
    getUser: (userId: string) => Promise<{
      emailAddresses: Array<{ emailAddress?: string | null }>;
      firstName?: string | null;
      lastName?: string | null;
      publicMetadata?: unknown;
    }>;
  };
};

export type CreateClerkAuthVerifierOptions = {
  secretKey?: string;
  appEnv?: string;
  verifyTokenFn?: VerifyTokenFn;
  clerkClient?: ClerkUsersClient;
  log?: ClerkAuthLogger;
};

function safeVerifyErrorFields(error: unknown): Record<string, unknown> {
  if (error instanceof TokenVerificationError) {
    return {
      errorName: "TokenVerificationError",
      reason: error.reason,
      ...(error.action ? { action: error.action } : {}),
    };
  }

  if (error instanceof Error) {
    return { errorName: error.name || "Error" };
  }

  return { errorName: "unknown" };
}

function safeFetchErrorFields(error: unknown): Record<string, unknown> {
  if (isClerkAPIResponseError(error)) {
    const codes = Array.isArray(error.errors)
      ? error.errors
          .map((item) => item.code)
          .filter((code): code is string => typeof code === "string")
          .slice(0, 5)
      : [];

    return {
      errorName: "ClerkAPIResponseError",
      status: error.status,
      ...(codes.length > 0 ? { errorCodes: codes } : {}),
    };
  }

  if (error instanceof Error) {
    return { errorName: error.name || "Error" };
  }

  return { errorName: "unknown" };
}

export function createClerkAuthVerifier(
  options: CreateClerkAuthVerifierOptions = {},
): AuthVerifier {
  const secretKey = options.secretKey ?? process.env.CLERK_SECRET_KEY;
  const appEnv = options.appEnv ?? process.env.APP_ENV ?? "development";

  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is required for Clerk auth");
  }

  const verifyTokenFn = options.verifyTokenFn ?? verifyToken;
  const clerk =
    options.clerkClient ?? createClerkClient({ secretKey });
  const log =
    options.log ??
    createClerkAuthLogger({
      environment: appEnv,
      secretKeyKind: resolveClerkSecretKeyKind(secretKey),
    });

  return {
    async verify(token: string): Promise<AuthIdentity | null> {
      let payload: Awaited<ReturnType<VerifyTokenFn>>;

      try {
        payload = await verifyTokenFn(token, { secretKey });
      } catch (error) {
        log("clerk_token_verification_failed", safeVerifyErrorFields(error));
        return null;
      }

      const userId = payload?.sub;
      if (!userId || typeof userId !== "string") {
        log("clerk_token_missing_sub", {
          errorName: "MissingSubject",
        });
        return null;
      }

      let user: Awaited<ReturnType<ClerkUsersClient["users"]["getUser"]>>;
      try {
        user = await clerk.users.getUser(userId);
      } catch (error) {
        log("clerk_user_fetch_failed", {
          userId,
          ...safeFetchErrorFields(error),
        });
        return null;
      }

      const email = user.emailAddresses[0]?.emailAddress;
      if (!email) {
        log("clerk_user_email_missing", { userId });
        return null;
      }

      const role = resolveAuthRole(user.publicMetadata);
      log("clerk_auth_verified", { userId, role });

      return {
        userId,
        email,
        name: user.firstName
          ? [user.firstName, user.lastName].filter(Boolean).join(" ")
          : null,
        role,
      };
    },
  };
}

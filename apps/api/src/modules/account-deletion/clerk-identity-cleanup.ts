/**
 * Outbound Clerk identity cleanup after internal account finalization.
 * Does not start account deletion; never loops into provider deletion.
 */

import { createClerkClient } from "@clerk/backend";

export type ClerkIdentityCleanupOutcome =
  | { status: "completed"; reason: "deleted" | "already_missing" }
  | { status: "failed"; message: string }
  | { status: "skipped"; reason: "already_completed" | "not_finalized" };

export type ClerkUserDeleter = (userId: string) => Promise<void>;

export type ClerkIdentityCleanupDeps = {
  deleteUser: ClerkUserDeleter;
  isNotFoundError?: (error: unknown) => boolean;
};

function defaultIsNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const status = (error as { status?: unknown }).status;
  if (status === 404) {
    return true;
  }

  const errors = (error as { errors?: Array<{ code?: string }> }).errors;
  if (Array.isArray(errors)) {
    return errors.some(
      (row) =>
        row?.code === "resource_not_found" || row?.code === "not_found",
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return /not[_ ]found|404/i.test(message);
}

export function createClerkUserDeleterFromEnv(): ClerkUserDeleter {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is required for Clerk identity cleanup");
  }

  const clerk = createClerkClient({ secretKey });
  return async (userId: string) => {
    await clerk.users.deleteUser(userId);
  };
}

/**
 * Delete Clerk user after local finalization.
 * Missing user is success. API failures return failed (caller keeps retry state).
 */
export async function deleteClerkIdentity(
  userId: string,
  deps: ClerkIdentityCleanupDeps,
): Promise<ClerkIdentityCleanupOutcome> {
  try {
    await deps.deleteUser(userId);
    return { status: "completed", reason: "deleted" };
  } catch (error) {
    const isNotFound = deps.isNotFoundError ?? defaultIsNotFoundError;
    if (isNotFound(error)) {
      return { status: "completed", reason: "already_missing" };
    }

    const message = error instanceof Error ? error.message : String(error);
    return { status: "failed", message };
  }
}

export function readClerkCleanupCompleted(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.clerkIdentityCleanup === "completed";
}

export function buildClerkCleanupMetadata(
  previous: Record<string, unknown> | null | undefined,
  outcome: ClerkIdentityCleanupOutcome,
  at: Date,
): Record<string, unknown> {
  const base = { ...(previous ?? {}) };

  if (outcome.status === "completed") {
    return {
      ...base,
      clerkIdentityCleanup: "completed",
      clerkIdentityCleanupReason: outcome.reason,
      clerkIdentityCleanupAt: at.toISOString(),
      clerkIdentityCleanupError: null,
    };
  }

  if (outcome.status === "failed") {
    return {
      ...base,
      clerkIdentityCleanup: "failed",
      clerkIdentityCleanupAt: at.toISOString(),
      clerkIdentityCleanupError: outcome.message,
    };
  }

  return base;
}

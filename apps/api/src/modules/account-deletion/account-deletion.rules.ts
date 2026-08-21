/**
 * Pure decision rules for account-deletion finalization ordering.
 * Used by the service and lifecycle tests (no DB / no side effects).
 */

import type { AccountEmailSendResult } from "./account-email-notifier.js";
import type { ClerkIdentityCleanupOutcome } from "./clerk-identity-cleanup.js";

export function canAttemptInternalFinalization(input: {
  accountDeletionStatus: string;
  openProviderDeletionCount: number;
}): boolean {
  if (input.accountDeletionStatus !== "ready_for_finalization") {
    return false;
  }
  return input.openProviderDeletionCount === 0;
}

/** Clerk identity delete only after local account is finalized. */
export function shouldAttemptClerkIdentityCleanup(input: {
  accountDeletionStatus: string;
  finalizedAt: Date | null | undefined;
  clerkCleanupCompleted: boolean;
}): boolean {
  if (input.clerkCleanupCompleted) {
    return false;
  }
  return (
    input.accountDeletionStatus === "deleted" &&
    Boolean(input.finalizedAt)
  );
}

/**
 * Inbound Clerk user.deleted after we already finalized outbound:
 * idempotent no-op — must not enqueue a new provider deletion loop.
 */
export function clerkInboundDeletedAction(input: {
  accountDeletionStatus: string;
  finalizedAt: Date | null | undefined;
}): "noop_already_finalized" | "start_or_continue_deletion" | "noop_missing" {
  if (
    input.accountDeletionStatus === "deleted" &&
    Boolean(input.finalizedAt)
  ) {
    return "noop_already_finalized";
  }
  return "start_or_continue_deletion";
}

export type EmailPersistencePatch = {
  emailSentAt: Date | null;
  notificationEmail: string | null;
  emailDelivery: AccountEmailSendResult["status"];
};

/**
 * Contract:
 * sent → set emailSentAt, clear notificationEmail
 * deferred | failed → emailSentAt stays null, retain notificationEmail
 */
export function nextEmailPersistence(input: {
  result: AccountEmailSendResult;
  notificationEmail: string;
  emailSentAt: Date | null;
  now?: Date;
}): EmailPersistencePatch {
  if (input.emailSentAt) {
    return {
      emailSentAt: input.emailSentAt,
      notificationEmail: null,
      emailDelivery: "sent",
    };
  }

  if (input.result.status === "sent") {
    return {
      emailSentAt: input.now ?? new Date(),
      notificationEmail: null,
      emailDelivery: "sent",
    };
  }

  return {
    emailSentAt: null,
    notificationEmail: input.notificationEmail,
    emailDelivery: input.result.status,
  };
}

export type FinalizePhase =
  | "blocked_provider_pending"
  | "internal_finalize"
  | "clerk_cleanup"
  | "email_notification"
  | "already_finalized_retry_cleanup";

/**
 * Recommended ordering after provider deletions are confirmed:
 * internal finalize → Clerk identity delete → deletion-complete email.
 */
export function planFinalizePhases(input: {
  accountDeletionStatus: string;
  finalizedAt: Date | null | undefined;
  openProviderDeletionCount: number;
  clerkCleanupCompleted: boolean;
  emailSentAt: Date | null;
}): FinalizePhase[] {
  if (
    input.accountDeletionStatus === "deleted" &&
    Boolean(input.finalizedAt)
  ) {
    const phases: FinalizePhase[] = ["already_finalized_retry_cleanup"];
    if (!input.clerkCleanupCompleted) {
      phases.push("clerk_cleanup");
    }
    if (!input.emailSentAt) {
      phases.push("email_notification");
    }
    return phases;
  }

  if (input.openProviderDeletionCount > 0) {
    return ["blocked_provider_pending"];
  }

  if (input.accountDeletionStatus !== "ready_for_finalization") {
    return ["blocked_provider_pending"];
  }

  const phases: FinalizePhase[] = ["internal_finalize", "clerk_cleanup"];
  phases.push("email_notification");
  return phases;
}

export function isClerkCleanupRetryable(
  outcome: ClerkIdentityCleanupOutcome,
): boolean {
  return outcome.status === "failed";
}

import { prisma, type Prisma } from "@ai-music/db";
import {
  buildAccountDeletionEmailIdempotencyKey,
  isAccountActiveForProductUse,
  isAccountDeletionBlockingStatus,
  logLoadControl,
} from "@ai-music/shared";
import {
  AccountDeletionPendingError,
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../../common/errors.js";
import { requestDeletionForAllUserVoiceProfiles } from "../voice-profiles/deletion.service.js";
import {
  ACCOUNT_DELETION_EMAIL_COPY,
  getAccountEmailNotifier,
  isEmailSendSuccess,
  type AccountEmailSendResult,
} from "./account-email-notifier.js";
import {
  buildClerkCleanupMetadata,
  createClerkUserDeleterFromEnv,
  deleteClerkIdentity,
  readClerkCleanupCompleted,
  type ClerkUserDeleter,
} from "./clerk-identity-cleanup.js";
import { shouldAttemptClerkIdentityCleanup } from "./account-deletion.rules.js";

const PROVIDER_REQUEST_OPEN = [
  "pending",
  "submitting",
  "submitted_to_provider",
  "submit_failed",
] as const;
/** Terminal non-blocking for account finalization (not open provider work). */
const PROVIDER_REQUEST_NON_BLOCKING = ["confirmed", "failed", "cancelled"] as const;

export type AccountDeletionDto = {
  status: string;
  requestedAt: string | null;
  finalizedAt: string | null;
  emailSentAt: string | null;
};

let clerkUserDeleterOverride: ClerkUserDeleter | null = null;

/** Tests only. */
export function setClerkUserDeleterForTests(deleter: ClerkUserDeleter | null): void {
  clerkUserDeleterOverride = deleter;
}

function resolveClerkUserDeleter(): ClerkUserDeleter {
  if (clerkUserDeleterOverride) {
    return clerkUserDeleterOverride;
  }
  return createClerkUserDeleterFromEnv();
}

export async function assertAccountActiveForProductUse(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountDeletionStatus: true },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (!isAccountActiveForProductUse(user.accountDeletionStatus)) {
    throw new AccountDeletionPendingError();
  }
}

export async function getAccountDeletionState(
  userId: string,
): Promise<AccountDeletionDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      accountDeletionStatus: true,
      accountDeletionRequestedAt: true,
      accountDeletionFinalizedAt: true,
      accountDeletionRequest: {
        select: { emailSentAt: true },
      },
    },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return {
    status: user.accountDeletionStatus,
    requestedAt: user.accountDeletionRequestedAt?.toISOString() ?? null,
    finalizedAt: user.accountDeletionFinalizedAt?.toISOString() ?? null,
    emailSentAt: user.accountDeletionRequest?.emailSentAt?.toISOString() ?? null,
  };
}

/**
 * Self-service account deletion from Profile.
 * Enqueues voice provider deletions; never a simple VoiceProfile disable.
 */
export async function requestAccountDeletion(
  userId: string,
  options?: { locale?: "en" | "ru" },
): Promise<AccountDeletionDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      accountDeletionStatus: true,
    },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (user.accountDeletionStatus === "deleted") {
    throw new ConflictError("Account is already deleted", "ACCOUNT_ALREADY_DELETED");
  }

  if (isAccountDeletionBlockingStatus(user.accountDeletionStatus)) {
    return getAccountDeletionState(userId);
  }

  if (user.email.startsWith("deleted+") && user.email.endsWith("@invalid.local")) {
    throw new BadRequestError("Account email is already anonymized", "ACCOUNT_ALREADY_ANONYMIZED");
  }

  const now = new Date();
  const locale = options?.locale === "en" ? "en" : "ru";

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        accountDeletionStatus: "deletion_requested",
        accountDeletionRequestedAt: now,
      },
    });

    await tx.accountDeletionRequest.upsert({
      where: { userId },
      create: {
        userId,
        status: "deletion_requested",
        notificationEmail: user.email,
        requestedAt: now,
        metadata: { locale },
      },
      update: {
        status: "deletion_requested",
        notificationEmail: user.email,
        requestedAt: now,
        metadata: { locale },
      },
    });
  });

  await requestDeletionForAllUserVoiceProfiles(userId);

  await refreshAccountDeletionProviderPhase(userId);
  await tryFinalizeAccountDeletion(userId);

  logLoadControl("voice_profile_account_deletion_enqueued", {
    userId,
    processed: 0,
    skipped: 0,
    totalProfiles: 0,
  });

  return getAccountDeletionState(userId);
}

export async function refreshAccountDeletionProviderPhase(
  userId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountDeletionStatus: true },
  });

  if (!user || user.accountDeletionStatus === "active" || user.accountDeletionStatus === "deleted") {
    return;
  }

  const openCount = await prisma.providerDataDeletionRequest.count({
    where: {
      userId,
      status: { in: [...PROVIDER_REQUEST_OPEN] },
    },
  });

  const nextStatus =
    openCount > 0 ? "provider_deletion_pending" : "ready_for_finalization";

  await prisma.user.update({
    where: { id: userId },
    data: { accountDeletionStatus: nextStatus },
  });

  await prisma.accountDeletionRequest.updateMany({
    where: { userId },
    data: { status: nextStatus },
  });
}

/**
 * Finalize when all provider tickets are confirmed (or none required).
 *
 * Ordering:
 * 1) provider deletions confirmed
 * 2) internal user/data finalization (once)
 * 3) Clerk identity deletion (retryable; failures do not undo step 2)
 * 4) deletion-complete email from notificationEmail snapshot (retryable)
 *
 * Idempotent. Retains billing/ledger rows; anonymizes PII on User.
 */
export async function tryFinalizeAccountDeletion(
  userId: string,
): Promise<{ finalized: boolean }> {
  await refreshAccountDeletionProviderPhase(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      accountDeletionStatus: true,
      accountDeletionFinalizedAt: true,
      accountDeletionRequest: true,
    },
  });

  if (!user) {
    return { finalized: false };
  }

  // Already finalized: retry Clerk + email only (no re-anonymize / no loops).
  if (user.accountDeletionStatus === "deleted" && user.accountDeletionFinalizedAt) {
    await ensureClerkIdentityCleanup(userId);
    await maybeSendDeletionCompleteEmail(userId);
    return { finalized: true };
  }

  if (user.accountDeletionStatus !== "ready_for_finalization") {
    return { finalized: false };
  }

  const openCount = await prisma.providerDataDeletionRequest.count({
    where: {
      userId,
      status: { in: [...PROVIDER_REQUEST_OPEN] },
    },
  });

  if (openCount > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: { accountDeletionStatus: "provider_deletion_pending" },
    });
    return { finalized: false };
  }

  const unfinished = await prisma.providerDataDeletionRequest.count({
    where: {
      userId,
      status: { notIn: [...PROVIDER_REQUEST_NON_BLOCKING] },
    },
  });

  if (unfinished > 0) {
    return { finalized: false };
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: { accountDeletionStatus: true, accountDeletionFinalizedAt: true },
    });

    // Concurrent finalize race: another worker already finalized.
    if (current?.accountDeletionStatus === "deleted" && current.accountDeletionFinalizedAt) {
      return;
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        accountDeletionStatus: "deleted",
        accountDeletionFinalizedAt: now,
        email: `deleted+${userId}@invalid.local`,
        name: null,
        vocalGender: null,
      },
    });

    await tx.accountDeletionRequest.updateMany({
      where: { userId },
      data: {
        status: "deleted",
        finalizedAt: now,
      },
    });

    await tx.voiceProfile.updateMany({
      where: {
        userId,
        status: { not: "provider_deleted" },
      },
      data: {
        status: "provider_deleted",
        deletedAt: now,
      },
    });
  });

  logLoadControl("voice_profile_account_deletion_enqueued", {
    userId,
    processed: 0,
    skipped: 0,
    totalProfiles: 0,
  });

  // Clerk failure must not roll back confirmed provider deletion / internal finalize.
  await ensureClerkIdentityCleanup(userId);
  await maybeSendDeletionCompleteEmail(userId);

  return { finalized: true };
}

/**
 * Outbound Clerk delete after internal finalize only.
 * Provider-pending callers never reach here with a completed finalize.
 */
export async function ensureClerkIdentityCleanup(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      accountDeletionStatus: true,
      accountDeletionFinalizedAt: true,
      accountDeletionRequest: { select: { metadata: true } },
    },
  });

  if (!user) {
    return;
  }

  const metadata = asRecord(user.accountDeletionRequest?.metadata);

  if (
    !shouldAttemptClerkIdentityCleanup({
      accountDeletionStatus: user.accountDeletionStatus,
      finalizedAt: user.accountDeletionFinalizedAt,
      clerkCleanupCompleted: readClerkCleanupCompleted(metadata),
    })
  ) {
    return;
  }

  let outcome;
  try {
    outcome = await deleteClerkIdentity(userId, {
      deleteUser: resolveClerkUserDeleter(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outcome = { status: "failed" as const, message };
  }

  const at = new Date();
  await prisma.accountDeletionRequest.updateMany({
    where: { userId },
    data: {
      metadata: buildClerkCleanupMetadata(metadata, outcome, at) as Prisma.InputJsonValue,
    },
  });
}

/**
 * Mark Clerk cleanup completed when inbound user.deleted arrives after outbound delete
 * (or Clerk Dashboard delete). Idempotent; does not enqueue a new deletion loop.
 */
export async function markClerkIdentityCleanupCompletedFromWebhook(
  userId: string,
): Promise<void> {
  const request = await prisma.accountDeletionRequest.findUnique({
    where: { userId },
    select: { metadata: true },
  });

  if (!request) {
    return;
  }

  const metadata = asRecord(request.metadata);
  if (readClerkCleanupCompleted(metadata)) {
    return;
  }

  await prisma.accountDeletionRequest.update({
    where: { userId },
    data: {
      metadata: buildClerkCleanupMetadata(
        metadata,
        { status: "completed", reason: "already_missing" },
        new Date(),
      ) as Prisma.InputJsonValue,
    },
  });
}

export async function maybeSendDeletionCompleteEmail(userId: string): Promise<void> {
  const request = await prisma.accountDeletionRequest.findUnique({
    where: { userId },
  });

  if (!request || request.emailSentAt) {
    return;
  }

  // Snapshot captured at request time — never User.email after anonymization.
  const email = request.notificationEmail?.trim();
  if (!email) {
    return;
  }

  const metadata = asRecord(request.metadata);
  const locale = metadata.locale === "en" ? "en" : "ru";

  const notifier = getAccountEmailNotifier();
  const result = await notifier.sendAccountDeletionComplete({
    to: email,
    locale,
    idempotencyKey: buildAccountDeletionEmailIdempotencyKey(userId),
  });

  await applyDeletionCompleteEmailResult(userId, result, {
    previousMetadata: metadata,
    locale,
    notificationEmail: email,
  });
}

/**
 * Pure-ish persistence rule for email outcomes (testable).
 * sent → emailSentAt + clear notificationEmail
 * deferred | failed → retain notificationEmail, emailSentAt stays null
 */
export async function applyDeletionCompleteEmailResult(
  userId: string,
  result: AccountEmailSendResult,
  context: {
    previousMetadata: Record<string, unknown>;
    locale: "en" | "ru";
    notificationEmail: string;
  },
): Promise<void> {
  const baseMeta = {
    ...context.previousMetadata,
    emailSubject: ACCOUNT_DELETION_EMAIL_COPY[context.locale].subject,
    emailDelivery: result.status,
    emailDeliveryReason: result.reason ?? result.status,
  } as Prisma.InputJsonValue;

  if (isEmailSendSuccess(result)) {
    await prisma.accountDeletionRequest.update({
      where: { userId },
      data: {
        emailSentAt: new Date(),
        notificationEmail: null,
        metadata: baseMeta,
      },
    });
    return;
  }

  // deferred / failed: keep pending notification for retry; do not claim send.
  await prisma.accountDeletionRequest.update({
    where: { userId },
    data: {
      notificationEmail: context.notificationEmail,
      metadata: baseMeta,
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

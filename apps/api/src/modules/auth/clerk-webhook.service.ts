import { createClerkClient } from "@clerk/backend";
import type { FastifyBaseLogger } from "fastify";
import { Webhook } from "svix";
import { prisma } from "@ai-music/db";
import { BadRequestError } from "../../common/errors.js";
import { AccountDeletionPendingError } from "../../common/errors.js";
import { syncAuthUser, type AuthIdentity } from "./sync-auth-user.js";
import { resolveAuthRole } from "./types.js";
import { requestDeletionForAllUserVoiceProfiles } from "../voice-profiles/deletion.service.js";
import {
  markClerkIdentityCleanupCompletedFromWebhook,
  tryFinalizeAccountDeletion,
} from "../account-deletion/account-deletion.service.js";
import { runOnceWebhookEvent } from "../webhooks/webhook-event.service.js";
import { isAccountDeletionBlockingStatus } from "@ai-music/shared";

type ClerkWebhookPayload = {
  type: string;
  data: Record<string, unknown>;
};

type ClerkWebhookLog = Pick<FastifyBaseLogger, "info" | "warn" | "error">;

function readSvixEventId(
  headers: Record<string, string | string[] | undefined>,
): string {
  const svixId = headers["svix-id"];
  const eventId = Array.isArray(svixId) ? svixId[0] : svixId;
  const trimmed = eventId?.trim();

  if (!trimmed) {
    throw new BadRequestError(
      "Missing Clerk webhook event id",
      "CLERK_WEBHOOK_EVENT_ID_MISSING",
    );
  }

  return trimmed;
}

function getClerkWebhookSecret(): string {
  const secret = process.env.CLERK_WEBHOOK_SECRET?.trim();

  if (!secret) {
    throw new BadRequestError("Clerk webhook secret не настроен", "CLERK_NOT_CONFIGURED");
  }

  return secret;
}

function readClerkUserId(data: Record<string, unknown>): string | null {
  return typeof data.id === "string" ? data.id : null;
}

function toAuthIdentity(data: Record<string, unknown>): AuthIdentity | null {
  const userId = readClerkUserId(data);
  const emailAddresses = Array.isArray(data.email_addresses) ? data.email_addresses : [];
  const email =
    typeof emailAddresses[0] === "object" &&
    emailAddresses[0] &&
    "email_address" in emailAddresses[0]
      ? String(emailAddresses[0].email_address)
      : null;

  if (!userId || !email) {
    return null;
  }

  const firstName = typeof data.first_name === "string" ? data.first_name : null;
  const lastName = typeof data.last_name === "string" ? data.last_name : null;

  return {
    userId,
    email,
    name: firstName ? [firstName, lastName].filter(Boolean).join(" ") : null,
    role: resolveAuthRole(data.public_metadata),
  };
}

async function handleClerkUserUpsert(
  data: Record<string, unknown>,
  log?: ClerkWebhookLog,
): Promise<void> {
  const identity = toAuthIdentity(data);
  const clerkUserId = readClerkUserId(data);

  if (!identity) {
    log?.warn(
      { clerkUserId },
      "Clerk webhook user upsert skipped: missing user id or email",
    );
    return;
  }

  try {
    await syncAuthUser(identity, log);
  } catch (error) {
    if (error instanceof AccountDeletionPendingError) {
      log?.info(
        { clerkUserId: identity.userId, action: "upsert_ignored_deletion_pending" },
        "Clerk user upsert ignored: account deletion in progress",
      );
      return;
    }
    throw error;
  }
}

async function handleClerkUserDeleted(
  data: Record<string, unknown>,
  log?: ClerkWebhookLog,
): Promise<void> {
  const userId = readClerkUserId(data);

  if (!userId) {
    log?.warn({}, "Clerk webhook user.deleted skipped: missing user id");
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      accountDeletionStatus: true,
      accountDeletionFinalizedAt: true,
      accountDeletionRequestedAt: true,
      email: true,
    },
  });

  if (!existing) {
    log?.info({ userId, action: "deleted_noop_missing" }, "Clerk user.deleted: no local user");
    return;
  }

  if (
    existing.accountDeletionStatus === "deleted" &&
    existing.accountDeletionFinalizedAt
  ) {
    // Outbound Clerk delete (or Dashboard delete) already finalized locally.
    // Mark identity cleanup complete; do not enqueue a new deletion loop.
    await markClerkIdentityCleanupCompletedFromWebhook(userId);

    log?.info(
      { userId, action: "deleted_already_finalized" },
      "Clerk user.deleted: already finalized — idempotent no-op",
    );
    return;
  }

  const deletion = await requestDeletionForAllUserVoiceProfiles(userId);

  log?.info(
    {
      userId,
      action: "voice_deletion_enqueued",
      processed: deletion.processed,
      skipped: deletion.skipped,
    },
    "Clerk user voice profiles queued for deletion before anonymization",
  );

  const now = new Date();
  const nextStatus = isAccountDeletionBlockingStatus(existing.accountDeletionStatus)
    ? existing.accountDeletionStatus
    : "deletion_requested";

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted+${userId}@invalid.local`,
        name: null,
        accountDeletionStatus: nextStatus,
        accountDeletionRequestedAt: existing.accountDeletionRequestedAt ?? now,
      },
    });

    await tx.accountDeletionRequest.upsert({
      where: { userId },
      create: {
        userId,
        status: "deletion_requested",
        notificationEmail: existing.email.includes("@invalid.local")
          ? null
          : existing.email,
        requestedAt: now,
      },
      update: {
        status: nextStatus === "deleted" ? "deleted" : "deletion_requested",
      },
    });
  });

  await tryFinalizeAccountDeletion(userId).catch(() => undefined);

  log?.info(
    { userId, action: "deleted" },
    "Clerk user anonymized after delete (idempotent)",
  );
}

export async function handleClerkWebhook(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  log?: ClerkWebhookLog,
): Promise<{ received: boolean }> {
  const secret = getClerkWebhookSecret();
  const wh = new Webhook(secret);

  let event: ClerkWebhookPayload;

  try {
    event = wh.verify(rawBody, headers as Record<string, string>) as ClerkWebhookPayload;
  } catch {
    throw new BadRequestError("Invalid Clerk webhook signature");
  }

  const eventId = readSvixEventId(headers);
  const clerkUserId = readClerkUserId(event.data);

  log?.info({ eventId, eventType: event.type, clerkUserId }, "Clerk webhook received");

  await runOnceWebhookEvent({
    provider: "clerk",
    eventId,
    type: event.type,
    handler: async () => {
      switch (event.type) {
        case "user.created":
        case "user.updated":
          await handleClerkUserUpsert(event.data, log);
          return;
        case "user.deleted":
          await handleClerkUserDeleted(event.data, log);
          return;
        default:
          return;
      }
    },
  });

  return { received: true };
}

export async function ensureUserFromClerk(clerkUserId: string): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();

  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is required");
  }

  const clerk = createClerkClient({ secretKey });
  const user = await clerk.users.getUser(clerkUserId);
  const email = user.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new Error("Clerk user has no email");
  }

  await syncAuthUser({
    userId: clerkUserId,
    email,
    name: user.firstName
      ? [user.firstName, user.lastName].filter(Boolean).join(" ")
      : null,
    role: resolveAuthRole(user.publicMetadata),
  });
}

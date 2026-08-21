import { prisma } from "@ai-music/db";
import { PLANS, creditsToUnits, isAccountDeletionBlockingStatus } from "@ai-music/shared";
import type { FastifyBaseLogger } from "fastify";
import { AccountDeletionPendingError } from "../../common/errors.js";
import type { AuthIdentity } from "./types.js";

export type { AuthIdentity };

type AuthSyncLog = Pick<FastifyBaseLogger, "info" | "warn" | "error">;

/**
 * Sync Clerk identity → User row.
 * Must NOT revive deletion_pending / deleted accounts (no email restore).
 */
export async function syncAuthUser(identity: AuthIdentity, log?: AuthSyncLog) {
  const existing = await prisma.user.findUnique({
    where: { id: identity.userId },
    select: {
      id: true,
      accountDeletionStatus: true,
    },
  });

  if (existing) {
    if (isAccountDeletionBlockingStatus(existing.accountDeletionStatus)) {
      log?.warn(
        {
          userId: identity.userId,
          accountDeletionStatus: existing.accountDeletionStatus,
          action: "blocked_sync",
        },
        "Auth sync blocked: account deletion in progress",
      );
      throw new AccountDeletionPendingError();
    }

    const user = await prisma.user.update({
      where: { id: identity.userId },
      data: {
        email: identity.email,
        name: identity.name,
      },
    });

    log?.info(
      { userId: identity.userId, email: identity.email, action: "updated" },
      "Auth user synced",
    );

    return user;
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        id: identity.userId,
        email: identity.email,
        name: identity.name,
        accountDeletionStatus: "active",
      },
    });

    await tx.subscription.create({
      data: {
        userId: created.id,
        planId: "free",
        status: "active",
      },
    });

    await tx.creditTransaction.create({
      data: {
        userId: created.id,
        type: "purchase",
        amountUnits: creditsToUnits(PLANS.free.monthlyCredits),
        reason: "free_demo",
        idempotencyKey: `free_demo:${created.id}`,
      },
    });

    return created;
  });

  log?.info(
    { userId: identity.userId, email: identity.email, action: "created" },
    "Auth user synced",
  );

  return user;
}

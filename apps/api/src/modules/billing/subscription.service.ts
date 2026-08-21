import { prisma, type Prisma } from "@ai-music/db";
import { PLANS, type PlanId } from "@ai-music/shared";

const DEFAULT_PLAN_ID: PlanId = "free";

function isPlanId(value: string): value is PlanId {
  return value in PLANS;
}

/** Normalize DB / override plan ids. Unknown values → free (never invent paid tiers). */
export function resolveSubscriptionPlanId(planId: string): PlanId {
  if (isPlanId(planId)) {
    return planId;
  }

  return DEFAULT_PLAN_ID;
}

/**
 * Plan store for entitlements (not a payment subscription).
 */
export async function getOrCreateSubscription(userId: string) {
  const existing = await prisma.subscription.findUnique({
    where: { userId },
  });

  if (existing) {
    return existing;
  }

  return prisma.subscription.create({
    data: {
      userId,
      planId: DEFAULT_PLAN_ID,
      status: "active",
    },
  });
}

/** Dev/admin plan updates only. */
export async function updateSubscriptionPlan(
  userId: string,
  input: {
    planId: PlanId;
    status?: string;
  },
  tx: Prisma.TransactionClient = prisma,
) {
  const existing = await tx.subscription.findUnique({ where: { userId } });

  if (!existing) {
    await tx.subscription.create({
      data: {
        userId,
        planId: DEFAULT_PLAN_ID,
        status: "active",
      },
    });
  }

  if (!isPlanId(input.planId)) {
    throw new Error(`Invalid plan id: ${input.planId}`);
  }

  return tx.subscription.update({
    where: { userId },
    data: {
      planId: input.planId,
      status: input.status,
    },
  });
}

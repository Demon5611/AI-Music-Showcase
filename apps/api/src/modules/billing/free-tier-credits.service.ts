import { grantCredits, prisma } from "@ai-music/db";
import { PLANS, creditsToUnits } from "@ai-music/shared";

const FREE_TIER_CREDITS_UPGRADE_REASON = "free_tier_credits_units_upgrade_v2";

export async function ensureFreeTierCredits(userId: string): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { planId: true },
  });

  if (!subscription || subscription.planId !== "free") {
    return;
  }

  const freeCreditUnits = creditsToUnits(PLANS.free.monthlyCredits);

  const existingUpgrade = await prisma.creditTransaction.findFirst({
    where: { userId, reason: FREE_TIER_CREDITS_UPGRADE_REASON },
    select: { id: true },
  });

  if (existingUpgrade) {
    return;
  }

  const aggregate = await prisma.creditTransaction.aggregate({
    where: { userId },
    _sum: { amountUnits: true },
  });

  const balanceUnits = aggregate._sum.amountUnits ?? 0;

  if (balanceUnits >= freeCreditUnits) {
    return;
  }

  await grantCredits({
    userId,
    amountUnits: freeCreditUnits - balanceUnits,
    reason: FREE_TIER_CREDITS_UPGRADE_REASON,
    idempotencyKey: `free_tier:${userId}:upgrade_v2`,
  });
}

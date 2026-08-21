import { config } from "dotenv";
import { resolve } from "node:path";
import { prisma } from "@ai-music/db";
import { PLANS, type PlanId } from "@ai-music/shared";

config({ path: resolve(import.meta.dirname, "../../../.env") });

function printUsage(): void {
  console.error("Usage: tsx scripts/set-dev-plan.ts <email> <free|pro|studio>");
  console.error("Example: tsx scripts/set-dev-plan.ts user@example.com pro");
}

function isPlanId(value: string): value is PlanId {
  return value in PLANS;
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const planIdArg = process.argv[3]?.trim().toLowerCase();

  if (!email || !planIdArg) {
    printUsage();
    process.exit(1);
  }

  if (!isPlanId(planIdArg)) {
    console.error(`Unknown plan: ${planIdArg}`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (!user) {
    const recentUsers = await prisma.user.findMany({
      select: { email: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    console.error(`User not found: ${email}`);
    console.error("Use the email you sign in with (Clerk), not the placeholder from docs.");

    if (recentUsers.length > 0) {
      console.error("Recent users in DB:");
      for (const entry of recentUsers) {
        console.error(`  - ${entry.email}`);
      }
    }

    console.error(
      "Or set BILLING_DEV_PLAN_OVERRIDE=studio in .env (dev only) and restart API — no DB change.",
    );
    process.exit(1);
  }

  const subscription = await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      planId: planIdArg,
      status: "active",
    },
    update: {
      planId: planIdArg,
      status: "active",
    },
    select: { planId: true, status: true },
  });

  console.log(
    JSON.stringify(
      {
        email: user.email,
        userId: user.id,
        planId: subscription.planId,
        planLabel: PLANS[planIdArg].label,
        status: subscription.status,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

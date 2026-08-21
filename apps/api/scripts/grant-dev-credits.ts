import { config } from "dotenv";
import { resolve } from "node:path";
import { getCreditsBalance, grantCredits, prisma } from "@ai-music/db";
import { creditsToUnits } from "@ai-music/shared";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const DEFAULT_AMOUNT = 30;

function printUsage(): void {
  console.error("Usage: tsx scripts/grant-dev-credits.ts <email> [amount]");
  console.error(`Example: tsx scripts/grant-dev-credits.ts user@example.com ${DEFAULT_AMOUNT}`);
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const amountArg = process.argv[3];

  if (!email) {
    printUsage();
    process.exit(1);
  }

  const amount = amountArg ? Number(amountArg) : DEFAULT_AMOUNT;

  if (!Number.isFinite(amount) || amount <= 0) {
    console.error("amount must be a positive number");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const balanceBefore = await getCreditsBalance(user.id);
  await grantCredits({
    userId: user.id,
    amountUnits: creditsToUnits(amount),
    reason: "manual_dev_grant",
    idempotencyKey: `dev_grant:${user.id}:${Date.now()}`,
  });
  const balanceAfter = await getCreditsBalance(user.id);

  console.log(
    JSON.stringify(
      {
        email: user.email,
        userId: user.id,
        granted: amount,
        balanceBefore,
        balanceAfter,
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

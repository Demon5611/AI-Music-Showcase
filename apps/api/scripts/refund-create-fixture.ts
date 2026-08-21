/**
 * Dev/staging-only: create a credited TBC CreditPackPurchase fixture for mock refund E2E.
 *
 * Usage:
 *   pnpm --filter @ai-music/api refund:create-fixture -- \
 *     --userId=user_xxx --scenario=returned [--amount=29] [--credits=2000]
 *
 * Requires:
 *   APP_ENV=development|staging
 *   TBC_REFUND_PROVIDER_MODE=mock
 *
 * Production: hard reject.
 */
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { prisma } from "@ai-music/db";
import {
  TBC_PAYMENT_PROVIDER,
  TBC_REFUND_MOCK_SCENARIOS,
  buildTbcRefundMockPayId,
  isProductionRuntimeEnvironment,
  resolveAppRuntimeEnv,
  type TbcRefundMockScenario,
} from "@ai-music/shared";

config({ path: resolve(import.meta.dirname, "../../../.env") });

function printUsage(): void {
  console.error(
    [
      "Usage: tsx scripts/refund-create-fixture.ts --userId=<id> --scenario=<scenario>",
      "Optional: --amount=29 --credits=2000 --packageId=creator --suffix=<id>",
      `Scenarios: ${TBC_REFUND_MOCK_SCENARIOS.join("|")}`,
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq <= 2) {
      continue;
    }
    out[arg.slice(2, eq)] = arg.slice(eq + 1).trim();
  }
  return out;
}

function assertFixtureAllowed(): void {
  const appEnv = resolveAppRuntimeEnv(process.env.APP_ENV);
  if (isProductionRuntimeEnvironment(appEnv)) {
    throw new Error("refund:create-fixture is forbidden when APP_ENV=production");
  }
  if (appEnv !== "development" && appEnv !== "staging") {
    throw new Error(`refund:create-fixture requires APP_ENV=development|staging (got ${appEnv})`);
  }

  const mode = (process.env.TBC_REFUND_PROVIDER_MODE ?? "real").trim().toLowerCase() || "real";
  if (mode !== "mock") {
    throw new Error(
      "refund:create-fixture requires TBC_REFUND_PROVIDER_MODE=mock",
    );
  }
}

async function main(): Promise<void> {
  assertFixtureAllowed();

  const args = parseArgs(process.argv.slice(2));
  const userId = args.userId?.trim();
  const scenarioRaw = args.scenario?.trim() as TbcRefundMockScenario | undefined;
  const amount = Number(args.amount ?? "29");
  const credits = Number(args.credits ?? "2000");
  const packageId = (args.packageId ?? "creator").trim();
  const suffix = (args.suffix ?? randomUUID()).trim();

  if (!userId || !scenarioRaw) {
    printUsage();
    process.exit(1);
  }

  if (!(TBC_REFUND_MOCK_SCENARIOS as readonly string[]).includes(scenarioRaw)) {
    console.error(`Invalid scenario: ${scenarioRaw}`);
    printUsage();
    process.exit(1);
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be a positive number");
  }
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new Error("credits must be a positive integer");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const providerPaymentId = buildTbcRefundMockPayId(scenarioRaw, suffix);
  const merchantPaymentId = `fixture-merchant-${suffix}`;
  const now = new Date();

  const purchase = await prisma.creditPackPurchase.create({
    data: {
      userId: user.id,
      provider: TBC_PAYMENT_PROVIDER,
      packageId,
      priceAmount: amount,
      currency: "USD",
      creditsAmount: credits,
      merchantPaymentId,
      providerPaymentId,
      status: "credited",
      providerStatus: "Succeeded",
      paidAt: now,
      creditedAt: now,
      metadata: {
        refundMockScenario: scenarioRaw,
        fixture: true,
        createdBy: "refund:create-fixture",
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        purchaseId: purchase.id,
        userId: user.id,
        email: user.email,
        providerPaymentId,
        scenario: scenarioRaw,
        amount,
        currency: "USD",
        credits,
        status: purchase.status,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Bounded retry for generate commit must not retry spend/enqueue, only
 * lock-busy and Prisma interactive-transaction failures (P2028/P2034/P2024).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma } from "@ai-music/db";
import {
  COMMIT_RETRY_BUDGET_MS,
  CreditLockBusyError,
  commitRetryReason,
  isPrismaInteractiveTransactionGoneError,
  isRetryableCommitTransactionError,
  isUniqueConstraintError,
  runWithCommitTransactionRetry,
} from "./commit-music-generation-retry.js";

function prismaError(code: string, message = "Transaction not found") {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code,
    clientVersion: "6.9.0",
  });
}

async function run() {
  assert.equal(isRetryableCommitTransactionError(new CreditLockBusyError()), true);
  assert.equal(isPrismaInteractiveTransactionGoneError(prismaError("P2028")), true);
  assert.equal(isPrismaInteractiveTransactionGoneError(prismaError("P2034")), true);
  assert.equal(isPrismaInteractiveTransactionGoneError(prismaError("P2024")), true);
  assert.equal(isRetryableCommitTransactionError(prismaError("P2028")), true);
  assert.equal(isRetryableCommitTransactionError(prismaError("P2002")), false);
  assert.equal(isUniqueConstraintError(prismaError("P2002")), true);
  assert.equal(isRetryableCommitTransactionError(new Error("Insufficient credits")), false);
  assert.equal(commitRetryReason(new CreditLockBusyError()), "credit_lock_busy");
  assert.equal(commitRetryReason(prismaError("P2028")), "P2028");

  let attempts = 0;
  const retried: number[] = [];
  const result = await runWithCommitTransactionRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new CreditLockBusyError();
      }
      if (attempts === 2) {
        throw prismaError("P2028");
      }
      return "ok";
    },
    {
      sleep: async () => undefined,
      onRetry: ({ attempt }) => {
        retried.push(attempt);
      },
    },
  );
  assert.equal(result, "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(retried, [1, 2]);

  let uniqueAttempts = 0;
  await assert.rejects(
    () =>
      runWithCommitTransactionRetry(async () => {
        uniqueAttempts += 1;
        throw prismaError("P2002");
      }),
    (error: unknown) => isUniqueConstraintError(error) && uniqueAttempts === 1,
  );

  let now = 0;
  let busyAttempts = 0;
  await assert.rejects(
    () =>
      runWithCommitTransactionRetry(
        async () => {
          busyAttempts += 1;
          throw new CreditLockBusyError();
        },
        {
          now: () => now,
          sleep: async () => {
            now += COMMIT_RETRY_BUDGET_MS;
          },
        },
      ),
    (error: unknown) => error instanceof CreditLockBusyError && busyAttempts >= 2,
  );

  const here = dirname(fileURLToPath(import.meta.url));
  const serviceSource = readFileSync(join(here, "service.ts"), "utf8");
  const ledgerSource = readFileSync(
    join(here, "../../../../../packages/db/src/credits-ledger.ts"),
    "utf8",
  );
  assert.match(serviceSource, /tryLockUserCreditsInTransaction/);
  assert.doesNotMatch(serviceSource, /lockUserCreditsInTransaction/);
  assert.match(serviceSource, /runWithCommitTransactionRetry/);
  assert.match(ledgerSource, /pg_try_advisory_xact_lock/);

  console.log("commit-music-generation-retry tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

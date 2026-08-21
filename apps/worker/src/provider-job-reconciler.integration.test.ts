/**
 * Integration tests for PR1 hardening. Requires a local Postgres and Redis
 * (docker compose up). Run: `pnpm --filter @ai-music/worker test:integration`.
 * All rows are namespaced to throwaway test users and cleaned up at the end.
 */
import "./common/load-env.js";
import { randomUUID } from "node:crypto";
import {
  getCreditsBalanceUnits,
  grantCredits,
  InsufficientCreditsLedgerError,
  prisma,
  refundCredits,
  spendCredits,
  type Prisma,
} from "@ai-music/db";
import { OPERATION_COST_UNITS } from "@ai-music/shared";
import { closeProviderJobQueue, getProviderJobQueue } from "./provider-job-queue.js";
import { reconcileQueuedMusicGenerations } from "./provider-job-reconciler.js";

const COST = OPERATION_COST_UNITS.generateTrack;
const createdUserIds: string[] = [];
const createdRecordIds: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  ok: ${message}`);
}

async function createTestUser(balanceUnits: number): Promise<string> {
  const id = `test_pr1_${randomUUID()}`;
  await prisma.user.create({ data: { id, email: `${id}@test.local`, name: "PR1 Test" } });
  createdUserIds.push(id);

  if (balanceUnits > 0) {
    await grantCredits({
      userId: id,
      amountUnits: balanceUnits,
      reason: "test_grant",
      idempotencyKey: `test:${id}:grant`,
    });
  }

  return id;
}

async function createQueuedRecord(userId: string, withJson: boolean): Promise<string> {
  const record = await prisma.musicGeneration.create({
    data: {
      userId,
      type: "song",
      providerTaskId: `queue:${randomUUID()}`,
      prompt: "integration test prompt",
      status: "pending",
      clientRequestId: randomUUID(),
      clientRequestHash: "test_hash",
      providerRequestJson: withJson
        ? ({ prompt: "integration test prompt", customMode: true } as Prisma.InputJsonValue)
        : undefined,
    },
  });
  createdRecordIds.push(record.id);
  return record.id;
}

async function makeStale(recordId: string): Promise<void> {
  await prisma.$executeRaw`UPDATE music_generations SET updated_at = now() - interval '5 minutes' WHERE id = ${recordId}`;
}

function providerJobId(recordId: string): string {
  return `provider:music_generate:${recordId}`;
}

async function jobExists(recordId: string): Promise<boolean> {
  const job = await getProviderJobQueue().getJob(providerJobId(recordId));
  return Boolean(job);
}

async function removeJobBestEffort(recordId: string): Promise<void> {
  try {
    const job = await getProviderJobQueue().getJob(providerJobId(recordId));
    if (job) {
      await job.remove();
    }
  } catch {
    // A concurrent worker may hold a lock on the job; leave it, retention handles it.
  }
}

async function testParallelSpendAtBalanceForOne(): Promise<void> {
  console.log("test: parallel spend at balance for a single operation");
  const userId = await createTestUser(COST);

  const results = await Promise.allSettled([
    spendCredits({
      userId,
      amountUnits: COST,
      reason: "music_generate",
      idempotencyKey: `test:${userId}:spendA`,
    }),
    spendCredits({
      userId,
      amountUnits: COST,
      reason: "music_generate",
      idempotencyKey: `test:${userId}:spendB`,
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  assert(fulfilled.length === 1, "exactly one parallel spend succeeds");
  assert(rejected.length === 1, "exactly one parallel spend is rejected");
  assert(
    rejected[0]?.status === "rejected" &&
      rejected[0].reason instanceof InsufficientCreditsLedgerError,
    "rejection is InsufficientCreditsLedgerError",
  );

  const balance = await getCreditsBalanceUnits(userId);
  assert(balance === 0, "balance is exactly zero, never negative");
}

async function testEnqueueErrorThenReconcilerRecovery(): Promise<void> {
  console.log("test: enqueue error leaves no refund, reconciler recovers");
  const userId = await createTestUser(COST * 5);
  const recordId = await createQueuedRecord(userId, true);

  await spendCredits({
    userId,
    amountUnits: COST,
    reason: "music_generate",
    idempotencyKey: `generation:${recordId}:spend`,
    relatedEntityType: "music_generation",
    relatedEntityId: recordId,
  });

  // Simulate: DB tx committed + spend done, but enqueue threw (no job added).
  const refund = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: `generation:${recordId}:refund` },
  });
  assert(refund === null, "enqueue error does not refund");

  const beforeReconcile = await prisma.musicGeneration.findUnique({ where: { id: recordId } });
  assert(beforeReconcile?.status === "pending", "record stays pending after enqueue error");
  assert((await jobExists(recordId)) === false, "no job before reconcile");

  await makeStale(recordId);
  await reconcileQueuedMusicGenerations();

  assert(await jobExists(recordId), "reconciler re-enqueued the stuck paid record");
  // Remove immediately so a running worker does not pick up a synthetic job.
  await removeJobBestEffort(recordId);
}

async function testReconcilerSkipsRefundedRecord(): Promise<void> {
  console.log("test: reconciler skips an already refunded record");
  const userId = await createTestUser(COST * 5);
  const recordId = await createQueuedRecord(userId, true);

  await spendCredits({
    userId,
    amountUnits: COST,
    reason: "music_generate",
    idempotencyKey: `generation:${recordId}:spend`,
    relatedEntityType: "music_generation",
    relatedEntityId: recordId,
  });
  await refundCredits({
    userId,
    amountUnits: COST,
    reason: "music_generate_refund",
    idempotencyKey: `generation:${recordId}:refund`,
    relatedEntityType: "music_generation",
    relatedEntityId: recordId,
  });

  await makeStale(recordId);
  await reconcileQueuedMusicGenerations();

  assert((await jobExists(recordId)) === false, "refunded record is not re-enqueued");
  const after = await prisma.musicGeneration.findUnique({ where: { id: recordId } });
  assert(after?.status === "failed", "refunded record is marked failed");
}

async function testReconcilerSkipsUnpaidRecord(): Promise<void> {
  console.log("test: reconciler skips an unpaid record");
  const userId = await createTestUser(0);
  const recordId = await createQueuedRecord(userId, true);

  await makeStale(recordId);
  await reconcileQueuedMusicGenerations();

  assert((await jobExists(recordId)) === false, "unpaid record is not re-enqueued");
  const after = await prisma.musicGeneration.findUnique({ where: { id: recordId } });
  assert(after?.status === "failed", "unpaid record marked failed (not left pending)");
  assert(
    after?.errorMessage === "RECONCILE_MISSING_SPEND",
    "unpaid record errorMessage is RECONCILE_MISSING_SPEND",
  );

  const refund = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: `generation:${recordId}:refund` },
  });
  assert(refund === null, "unpaid record is not refunded");
}

async function cleanup(): Promise<void> {
  for (const recordId of createdRecordIds) {
    await removeJobBestEffort(recordId);
  }

  if (createdUserIds.length > 0) {
    await prisma.creditTransaction.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.musicGeneration.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.subscription.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
}

async function main(): Promise<void> {
  try {
    await testParallelSpendAtBalanceForOne();
    await testEnqueueErrorThenReconcilerRecovery();
    await testReconcilerSkipsRefundedRecord();
    await testReconcilerSkipsUnpaidRecord();
    console.log("\nprovider-job-reconciler integration tests passed");
  } finally {
    await cleanup();
    await closeProviderJobQueue();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

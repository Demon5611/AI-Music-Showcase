/**
 * Integration tests for concurrent Idempotency-Key handling. Requires a local
 * Postgres and Redis (docker compose up).
 * Run: `pnpm --filter @ai-music/api test:integration`.
 * All rows are namespaced to throwaway test users and cleaned up at the end.
 */
import "../../common/load-dotenv.js";
import { randomUUID } from "node:crypto";
import type { GenerateSongInput } from "@ai-music/ai-providers";
import { getCreditsBalanceUnits, grantCredits, prisma } from "@ai-music/db";
import { murekaProviderJobId, OPERATION_COST_UNITS } from "@ai-music/shared";
import { commitMusicGeneration } from "./service.js";
import {
  buildCanonicalMusicGenerateRequest,
  hashCanonicalRequest,
} from "./music-generate-idempotency.js";
import { murekaSpendIdempotencyKey } from "./music-generate-mureka.js";
import { closeProviderJobQueue, getProviderJobQueue } from "../queue/provider-job-queue.js";
import {
  closeMurekaProviderJobQueue,
  getMurekaProviderJobQueue,
} from "../queue/mureka-provider-job-queue.js";
import { InsufficientCreditsError, isAppError } from "../../common/errors.js";

const COST = OPERATION_COST_UNITS.generateTrack;
const MUREKA_COST = OPERATION_COST_UNITS.generateSongs;
const createdUserIds: string[] = [];
const createdRecordIds: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  ok: ${message}`);
}

async function createTestUser(balanceUnits: number): Promise<string> {
  const id = `test_idem_${randomUUID()}`;
  await prisma.user.create({ data: { id, email: `${id}@test.local`, name: "Idem Test" } });
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

function songInputFor(prompt: string): GenerateSongInput {
  return {
    prompt,
    durationSec: 60,
    mode: "song",
    providerOptions: {
      providerId: "sunoapi",
      options: { customMode: true },
    },
  };
}

function hashFor(input: GenerateSongInput): string {
  return hashCanonicalRequest(buildCanonicalMusicGenerateRequest(input, {}));
}

function metaFor(input: GenerateSongInput) {
  return {
    prompt: input.prompt,
    style: null,
    title: null,
    customMode: true,
    instrumental: false,
  };
}

async function removeJobBestEffort(recordId: string): Promise<void> {
  try {
    const job = await getProviderJobQueue().getJob(`provider:music_generate:${recordId}`);
    if (job) {
      await job.remove();
    }
  } catch {
    // A concurrent worker may hold a lock; retention handles cleanup.
  }

  try {
    const jobId = murekaProviderJobId({
      type: "mureka_music_generate",
      userId: "noop",
      recordId,
      songInputJson: "{}",
      spendReason: "noop",
    });
    const job = await getMurekaProviderJobQueue().getJob(jobId);
    if (job) {
      await job.remove();
    }
  } catch {
    // A concurrent worker may hold a lock; retention handles cleanup.
  }
}

function murekaCommitParams(
  userId: string,
  clientRequestId: string,
  input: GenerateSongInput,
) {
  return {
    userId,
    songInput: input,
    provider: "mureka" as const,
    clientRequestId,
    clientRequestHash: hashFor(input),
    creditAmountUnits: MUREKA_COST,
    creditIdempotencyKeyBuilder: murekaSpendIdempotencyKey,
    creditReason: "mureka_music_generate",
    meta: metaFor(input),
  };
}

async function testConcurrentSameKeySameBody(): Promise<void> {
  console.log("test: concurrent POST, same userId + key + body");
  const userId = await createTestUser(COST * 3);
  const clientRequestId = randomUUID();
  const input = songInputFor("concurrent same body");
  const clientRequestHash = hashFor(input);

  const params = {
    userId,
    songInput: input,
    clientRequestId,
    clientRequestHash,
    meta: metaFor(input),
  };

  const [a, b] = await Promise.all([
    commitMusicGeneration({ ...params }),
    commitMusicGeneration({ ...params }),
  ]);

  createdRecordIds.push(a.record.id, b.record.id);

  assert(a.record.id === b.record.id, "both responses return the same recordId");
  assert(Number(a.created) + Number(b.created) === 1, "exactly one call created the record");

  const genCount = await prisma.musicGeneration.count({ where: { userId, clientRequestId } });
  assert(genCount === 1, "exactly one MusicGeneration");

  const spendCount = await prisma.creditTransaction.count({
    where: { relatedEntityId: a.record.id, type: "spend" },
  });
  assert(spendCount === 1, "exactly one spend CreditTransaction");

  const balance = await getCreditsBalanceUnits(userId);
  assert(balance === COST * 3 - COST, "exactly one debit applied");

  const job = await getProviderJobQueue().getJob(`provider:music_generate:${a.record.id}`);
  assert(Boolean(job), "at most one deterministic BullMQ job (exactly one present)");
  await removeJobBestEffort(a.record.id);
}

async function testSameKeyDifferentBody(): Promise<void> {
  console.log("test: same key, different body -> 409");
  const userId = await createTestUser(COST * 3);
  const clientRequestId = randomUUID();
  const inputA = songInputFor("body A");
  const first = await commitMusicGeneration({
    userId,
    songInput: inputA,
    clientRequestId,
    clientRequestHash: hashFor(inputA),
    meta: metaFor(inputA),
  });
  createdRecordIds.push(first.record.id);

  const inputB = songInputFor("body B is different");
  let conflictCode: string | undefined;
  try {
    await commitMusicGeneration({
      userId,
      songInput: inputB,
      clientRequestId,
      clientRequestHash: hashFor(inputB),
      meta: metaFor(inputB),
    });
  } catch (error) {
    conflictCode = isAppError(error) ? error.code : undefined;
  }

  assert(conflictCode === "IDEMPOTENCY_KEY_REUSED", "second call rejected with IDEMPOTENCY_KEY_REUSED");

  const genCount = await prisma.musicGeneration.count({ where: { userId, clientRequestId } });
  assert(genCount === 1, "record is not duplicated on conflict");

  const spendCount = await prisma.creditTransaction.count({
    where: { relatedEntityId: first.record.id, type: "spend" },
  });
  assert(spendCount === 1, "spend is not duplicated on conflict");

  await removeJobBestEffort(first.record.id);
}

async function testConcurrentFiveUniqueKeys(): Promise<void> {
  console.log("test: 5 concurrent generate, unique keys, enough Mureka credits");
  const userId = await createTestUser(MUREKA_COST * 5);
  const input = songInputFor("five unique keys");
  const keys = Array.from({ length: 5 }, () => randomUUID());

  const results = await Promise.all(
    keys.map((clientRequestId) =>
      commitMusicGeneration(murekaCommitParams(userId, clientRequestId, input)),
    ),
  );

  for (const result of results) {
    createdRecordIds.push(result.record.id);
  }

  const recordIds = new Set(results.map((result) => result.record.id));
  assert(recordIds.size === 5, "five distinct generation records");
  assert(
    results.every((result) => result.created),
    "all five requests created a generation",
  );

  const genCount = await prisma.musicGeneration.count({ where: { userId } });
  assert(genCount === 5, "exactly five MusicGeneration rows");

  const spendCount = await prisma.creditTransaction.count({
    where: { userId, type: "spend" },
  });
  assert(spendCount === 5, "exactly five spend ledger rows");

  const spendSum = await prisma.creditTransaction.aggregate({
    where: { userId, type: "spend" },
    _sum: { amountUnits: true },
  });
  assert(spendSum._sum.amountUnits === -MUREKA_COST * 5, "5 × 24 credit spend");

  const balance = await getCreditsBalanceUnits(userId);
  assert(balance >= 0, "balance never goes negative");

  for (const result of results) {
    const jobId = murekaProviderJobId({
      type: "mureka_music_generate",
      userId,
      recordId: result.record.id,
      songInputJson: "{}",
      spendReason: "noop",
    });
    const job = await getMurekaProviderJobQueue().getJob(jobId);
    assert(Boolean(job), `mureka job dispatched for ${result.record.id}`);
  }
}

async function testConcurrentFiveSameKey(): Promise<void> {
  console.log("test: 5 concurrent generate, same Idempotency-Key");
  const userId = await createTestUser(MUREKA_COST * 5);
  const clientRequestId = randomUUID();
  const input = songInputFor("five same key");
  const params = murekaCommitParams(userId, clientRequestId, input);

  const results = await Promise.all(
    Array.from({ length: 5 }, () => commitMusicGeneration({ ...params })),
  );

  for (const result of results) {
    createdRecordIds.push(result.record.id);
  }

  const recordIds = new Set(results.map((result) => result.record.id));
  assert(recordIds.size === 1, "one logical generation");
  assert(
    results.filter((result) => result.created).length === 1,
    "exactly one caller created the record",
  );

  const genCount = await prisma.musicGeneration.count({ where: { userId, clientRequestId } });
  assert(genCount === 1, "exactly one MusicGeneration");

  const spendCount = await prisma.creditTransaction.count({
    where: { userId, type: "spend" },
  });
  assert(spendCount === 1, "exactly one spend");

  const spendSum = await prisma.creditTransaction.aggregate({
    where: { userId, type: "spend" },
    _sum: { amountUnits: true },
  });
  assert(spendSum._sum.amountUnits === -MUREKA_COST, "only one 24-credit debit");

  const balance = await getCreditsBalanceUnits(userId);
  assert(balance >= 0, "balance never goes negative");

  const jobId = murekaProviderJobId({
    type: "mureka_music_generate",
    userId,
    recordId: results[0].record.id,
    songInputJson: "{}",
    spendReason: "noop",
  });
  const job = await getMurekaProviderJobQueue().getJob(jobId);
  assert(Boolean(job), "exactly one mureka queue dispatch");
}

async function testConcurrentInsufficientBalance(): Promise<void> {
  console.log("test: 5 concurrent generate, credits for only 2");
  const userId = await createTestUser(MUREKA_COST * 2);
  const input = songInputFor("insufficient concurrent");
  const keys = Array.from({ length: 5 }, () => randomUUID());

  const settled = await Promise.allSettled(
    keys.map((clientRequestId) =>
      commitMusicGeneration(murekaCommitParams(userId, clientRequestId, input)),
    ),
  );

  const succeeded = settled.filter(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof commitMusicGeneration>>> =>
      result.status === "fulfilled",
  );
  const failed = settled.filter((result) => result.status === "rejected");

  for (const result of succeeded) {
    createdRecordIds.push(result.value.record.id);
  }

  assert(succeeded.length === 2, "exactly two reservations succeed");
  assert(failed.length === 3, "remaining three are rejected");
  assert(
    failed.every(
      (result) =>
        result.status === "rejected" && result.reason instanceof InsufficientCreditsError,
    ),
    "rejections are InsufficientCreditsError (402)",
  );

  const genCount = await prisma.musicGeneration.count({ where: { userId } });
  assert(genCount === 2, "only two generation records");

  const spendCount = await prisma.creditTransaction.count({
    where: { userId, type: "spend" },
  });
  assert(spendCount === 2, "only two spend rows");

  const balance = await getCreditsBalanceUnits(userId);
  assert(balance === 0, "balance is zero, never negative");
}

async function testHeldAdvisoryLockDoesNotP2028(): Promise<void> {
  console.log("test: held advisory lock longer than Prisma tx timeout does not P2028");
  const userId = await createTestUser(COST);
  const clientRequestId = randomUUID();
  const input = songInputFor("held lock");

  const lockHolder = prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`;
      await tx.$executeRaw`SELECT pg_sleep(6)`;
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  const pending = commitMusicGeneration({
    userId,
    songInput: input,
    clientRequestId,
    clientRequestHash: hashFor(input),
    meta: metaFor(input),
  });

  const [, result] = await Promise.all([lockHolder, pending]);
  createdRecordIds.push(result.record.id);

  assert(result.created, "commit succeeds after lock holder releases");
  const spendCount = await prisma.creditTransaction.count({
    where: { relatedEntityId: result.record.id, type: "spend" },
  });
  assert(spendCount === 1, "exactly one spend after waiting on held lock");
  await removeJobBestEffort(result.record.id);
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
    await testConcurrentSameKeySameBody();
    await testSameKeyDifferentBody();
    await testConcurrentFiveUniqueKeys();
    await testConcurrentFiveSameKey();
    await testConcurrentInsufficientBalance();
    await testHeldAdvisoryLockDoesNotP2028();
    console.log("\ncommit-music-generation integration tests passed");
  } finally {
    await cleanup();
    await closeProviderJobQueue();
    await closeMurekaProviderJobQueue();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

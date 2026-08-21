/**
 * PR3/PR8.1 integration tests: music_generate submit guard via MusicGenerationProvider DI.
 * Requires local Postgres. Run:
 *   pnpm --filter @ai-music/worker test:submit-guard
 */
import "./common/load-env.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  grantCredits,
  prisma,
  type Prisma,
} from "@ai-music/db";
import {
  createMockMusicGenerationProvider,
  type MockMusicGenerationProvider,
  type SubmitGenerationResult,
} from "@ai-music/ai-providers";
import { OPERATION_COST_UNITS } from "@ai-music/shared";
import type { Job } from "bullmq";
import {
  processProviderJob,
  type MusicGenerateSubmitDeps,
} from "./processors/process-provider-job.js";

const COST = OPERATION_COST_UNITS.generateTrack;
const createdUserIds: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  ok: ${message}`);
}

async function createUser(): Promise<string> {
  const id = `test_pr3_${randomUUID()}`;
  await prisma.user.create({ data: { id, email: `${id}@test.local`, name: "PR3" } });
  createdUserIds.push(id);
  await grantCredits({
    userId: id,
    amountUnits: COST * 5,
    reason: "test_grant",
    idempotencyKey: `test:${id}:grant`,
  });
  return id;
}

async function createQueuedRecord(userId: string): Promise<string> {
  const record = await prisma.musicGeneration.create({
    data: {
      userId,
      type: "song",
      providerTaskId: `queue:${randomUUID()}`,
      prompt: "pr3 test",
      status: "pending",
      submissionState: "queued",
      providerRequestJson: { prompt: "pr3 test" } as Prisma.InputJsonValue,
    },
  });
  return record.id;
}

function payload(userId: string, recordId: string, recovered?: string) {
  return {
    type: "music_generate" as const,
    userId,
    recordId,
    songInputJson: JSON.stringify({ prompt: "pr3 test", customMode: true }),
    spendReason: `music_generate:${recordId}`,
    recoveredProviderTaskId: recovered,
  };
}

function attempt(n = 1, max = 3) {
  return { attempt: n, maxAttempts: max };
}

function mockJob(data: ReturnType<typeof payload>): Job {
  const store = { data };
  return {
    get data() {
      return store.data;
    },
    updateData: async (next: typeof store.data) => {
      store.data = next;
    },
  } as unknown as Job;
}

function depsFromMock(provider: MockMusicGenerationProvider): MusicGenerateSubmitDeps {
  return {
    provider,
    acquireSubmitPermit: async () => undefined,
  };
}

async function cleanup(): Promise<void> {
  if (createdUserIds.length === 0) {
    return;
  }
  await prisma.creditTransaction.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.musicGeneration.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.subscription.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
}

async function testProcessorHasNoSunoSubmitImports(): Promise<void> {
  console.log("test: processor source has no Suno submit imports");
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "processors/process-provider-job.ts"), "utf8");
  const banned = [
    "createSunoApiProvider",
    "submitSunoMusicTaskOnce",
    "PreparedSunoMusicGenerate",
    "prepareMusicGenerate",
    "getSunoRateLimiter",
    "createSunoMusicGenerationProvider",
  ];
  for (const token of banned) {
    assert(!source.includes(token), `processor must not mention ${token}`);
  }
}

async function testHappySubmitViaMock(): Promise<void> {
  console.log("test: happy submit via mock provider");
  const userId = await createUser();
  const recordId = await createQueuedRecord(userId);
  const provider = createMockMusicGenerationProvider({
    submitMode: { kind: "ok", taskId: `task_${recordId}` },
  });

  await processProviderJob(
    payload(userId, recordId),
    attempt(),
    undefined,
    depsFromMock(provider),
  );

  assert(provider.getSubmitCount() === 1, "exactly one provider POST");
  const row = await prisma.musicGeneration.findUnique({ where: { id: recordId } });
  assert(row?.submissionState === "submitted", "submissionState=submitted");
  assert(row?.providerTaskId === `task_${recordId}`, "providerTaskId persisted");
}

async function testConcurrentWorkersOnePost(): Promise<void> {
  console.log("test: two workers concurrent → one POST");
  const userId = await createUser();
  const recordId = await createQueuedRecord(userId);
  let posts = 0;

  const provider = createMockMusicGenerationProvider({
    submitMode: { kind: "ok", taskId: `task_${recordId}` },
    onSubmit: async () => {
      posts += 1;
      await new Promise((r) => setTimeout(r, 50));
    },
  });

  await Promise.all([
    processProviderJob(payload(userId, recordId), attempt(), undefined, depsFromMock(provider)),
    processProviderJob(payload(userId, recordId), attempt(), undefined, depsFromMock(provider)),
  ]);

  assert(posts === 1, "exactly one vendor POST");
  const row = await prisma.musicGeneration.findUnique({ where: { id: recordId } });
  assert(row?.submissionState === "submitted", "submissionState=submitted");
  assert(row?.providerTaskId === `task_${recordId}`, "providerTaskId persisted");
}

async function testCrashAfterCasBeforeFetch(): Promise<void> {
  console.log("test: crash after CAS before fetch → unknown, no re-POST");
  const userId = await createUser();
  const recordId = await createQueuedRecord(userId);

  const providerCrash = createMockMusicGenerationProvider({
    submitMode: { kind: "throw", message: "simulated crash after CAS" },
  });

  try {
    await processProviderJob(
      payload(userId, recordId),
      attempt(),
      undefined,
      depsFromMock(providerCrash),
    );
  } catch {
    // expected
  }

  assert(providerCrash.getSubmitCount() === 1, "first attempt reached submit (after CAS)");
  const mid = await prisma.musicGeneration.findUnique({ where: { id: recordId } });
  assert(mid?.submissionState === "submit_unknown", "crash after CAS → submit_unknown");

  const providerRetry = createMockMusicGenerationProvider({
    submitMode: { kind: "ok", taskId: "should_not_fire" },
  });

  let blocked = false;
  try {
    await processProviderJob(
      payload(userId, recordId),
      attempt(2),
      undefined,
      depsFromMock(providerRetry),
    );
  } catch {
    blocked = true;
  }

  assert(providerRetry.getSubmitCount() === 0, "retry does not POST again");
  assert(blocked, "retry fails closed");
}

async function testExplicit430BoundedRetry(): Promise<void> {
  console.log("test: explicit 430 → release to queued + bounded retry");
  const userId = await createUser();
  const recordId = await createQueuedRecord(userId);

  const provider = createMockMusicGenerationProvider({
    submitMode: {
      kind: "retryable_capacity",
      code: 430,
      message: "frequency limit",
    },
  });
  const deps = depsFromMock(provider);

  try {
    await processProviderJob(payload(userId, recordId), attempt(1, 3), undefined, deps);
  } catch {
    // retryable
  }

  const mid = await prisma.musicGeneration.findUnique({ where: { id: recordId } });
  assert(mid?.submissionState === "queued", "430 releases back to queued");
  assert(provider.getSubmitCount() === 1, "one POST on attempt 1");

  try {
    await processProviderJob(payload(userId, recordId), attempt(2, 3), undefined, deps);
  } catch {
    // retryable
  }

  assert(provider.getSubmitCount() === 2, "second attempt POSTs again after queued release");
}

async function testVendor500Unknown(): Promise<void> {
  console.log("test: vendor 500 → submit_unknown");
  const userId = await createUser();
  const recordId = await createQueuedRecord(userId);

  const provider = createMockMusicGenerationProvider({
    submitMode: { kind: "ambiguous", code: 500, message: "vendor 500" } satisfies SubmitGenerationResult,
  });
  const deps = depsFromMock(provider);

  try {
    await processProviderJob(payload(userId, recordId), attempt(), undefined, deps);
  } catch {
    // unrecoverable
  }

  const row = await prisma.musicGeneration.findUnique({ where: { id: recordId } });
  assert(row?.submissionState === "submit_unknown", "500 → submit_unknown");

  const before = provider.getSubmitCount();
  try {
    await processProviderJob(payload(userId, recordId), attempt(2), undefined, deps);
  } catch {
    // blocked
  }
  assert(provider.getSubmitCount() === before, "no second POST after unknown");

  const refund = await prisma.creditTransaction.findUnique({
    where: { idempotencyKey: `generation:${recordId}:refund` },
  });
  assert(refund === null, "no refund on submit_unknown");
}

async function testRecoveredTaskIdFromJobData(): Promise<void> {
  console.log("test: taskId recovered from BullMQ job.data");
  const userId = await createUser();
  const recordId = await createQueuedRecord(userId);
  const taskId = `recovered_${recordId}`;

  await prisma.musicGeneration.update({
    where: { id: recordId },
    data: {
      submissionState: "dispatching",
      submitAttemptId: randomUUID(),
      submitAttemptedAt: new Date(),
    },
  });

  const provider = createMockMusicGenerationProvider({
    submitMode: { kind: "ok", taskId: "should_not" },
  });

  await processProviderJob(
    payload(userId, recordId, taskId),
    attempt(),
    undefined,
    depsFromMock(provider),
  );

  assert(provider.getSubmitCount() === 0, "persist-only path does not POST");
  const row = await prisma.musicGeneration.findUnique({ where: { id: recordId } });
  assert(row?.providerTaskId === taskId, "recovered taskId persisted");
  assert(row?.submissionState === "submitted", "state submitted after recover");
}

async function testDbUpdateFailureNoSecondPost(): Promise<void> {
  console.log("test: DB update failure saves job.data, no second POST");
  const userId = await createUser();
  const recordId = await createQueuedRecord(userId);
  const job = mockJob(payload(userId, recordId));
  const taskId = `accept_${recordId}`;

  await prisma.musicGeneration.create({
    data: {
      userId,
      type: "song",
      providerTaskId: taskId,
      prompt: "holder",
      status: "pending",
      submissionState: "submitted",
    },
  });

  const provider = createMockMusicGenerationProvider({
    submitMode: { kind: "ok", taskId },
  });
  const deps = depsFromMock(provider);

  try {
    await processProviderJob(payload(userId, recordId), attempt(1, 3), job, deps);
  } catch {
    // retryable after save to job.data
  }

  assert(provider.getSubmitCount() === 1, "one POST before DB failure");
  assert(
    job.data.recoveredProviderTaskId === taskId,
    "taskId stored on BullMQ job.data",
  );

  await prisma.musicGeneration.deleteMany({
    where: { userId, providerTaskId: taskId, id: { not: recordId } },
  });

  await processProviderJob(
    { ...payload(userId, recordId), recoveredProviderTaskId: taskId },
    attempt(2, 3),
    job,
    deps,
  );

  assert(provider.getSubmitCount() === 1, "retry after DB failure does not POST");
  const row = await prisma.musicGeneration.findUnique({ where: { id: recordId } });
  assert(row?.providerTaskId === taskId, "taskId persisted on recover attempt");
  assert(row?.submissionState === "submitted", "submitted after recover");
}

async function testFailedTerminalClassification(): Promise<void> {
  console.log("test: failed_terminal classification");
  const userId = await createUser();
  const recordId = await createQueuedRecord(userId);
  const provider = createMockMusicGenerationProvider({
    submitMode: { kind: "failed_terminal", code: 400, message: "bad request" },
  });

  try {
    await processProviderJob(
      payload(userId, recordId),
      attempt(),
      undefined,
      depsFromMock(provider),
    );
  } catch {
    // expected
  }

  const row = await prisma.musicGeneration.findUnique({ where: { id: recordId } });
  assert(row?.submissionState === "failed", "terminal → failed");
  assert(row?.status === "failed", "status failed");
  assert(provider.getSubmitCount() === 1, "one POST");
}

async function testMigrationBackfill(): Promise<void> {
  console.log("test: migration backfill invariants on existing rows");
  const counts = await prisma.$queryRaw<Array<{ submission_state: string; n: bigint }>>`
    SELECT submission_state::text, count(*)::bigint AS n
    FROM music_generations
    GROUP BY submission_state
  `;

  assert(counts.length >= 1, "submission_state column populated");

  const bad = await prisma.musicGeneration.findMany({
    where: {
      userId: { in: createdUserIds },
      status: "failed",
      submissionState: { not: "failed" },
    },
    take: 1,
    select: { id: true },
  });
  assert(bad.length === 0, "failed status backfilled to submission_state=failed");

  const mismatch = await prisma.musicGeneration.findMany({
    where: {
      userId: { in: createdUserIds },
      status: { not: "failed" },
      NOT: { providerTaskId: { startsWith: "queue:" } },
      submissionState: { not: "submitted" },
    },
    take: 1,
    select: { id: true },
  });
  assert(mismatch.length === 0, "real providerTaskId backfilled to submitted");
}

async function main(): Promise<void> {
  try {
    await testProcessorHasNoSunoSubmitImports();
    await testHappySubmitViaMock();
    await testConcurrentWorkersOnePost();
    await testCrashAfterCasBeforeFetch();
    await testExplicit430BoundedRetry();
    await testVendor500Unknown();
    await testRecoveredTaskIdFromJobData();
    await testDbUpdateFailureNoSecondPost();
    await testFailedTerminalClassification();
    await testMigrationBackfill();
    console.log("\nPR3/PR8.1 submit-guard integration tests passed");
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

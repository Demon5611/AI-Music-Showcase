import assert from "node:assert/strict";
import {
  DB_STARTUP_RETRY_DELAYS_MS,
  ensureDatabaseReady,
  isRetryableDbError,
} from "./db-availability.js";

class PrismaClientInitializationError extends Error {
  override name = "PrismaClientInitializationError";
}

function p1001(message = "Can't reach database server"): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = "P1001";
  return error;
}

function runIsRetryableChecks(): void {
  assert.equal(isRetryableDbError(new PrismaClientInitializationError("init")), true);
  assert.equal(isRetryableDbError(p1001()), true);
  assert.equal(isRetryableDbError(new Error("ECONNREFUSED 5432")), true);
  assert.equal(isRetryableDbError(new Error("Unexpected null payload")), false);
  assert.equal(isRetryableDbError({ message: "bug in reconciler" }), false);
}

async function testDbReadyImmediately(): Promise<void> {
  let pings = 0;
  const sleeps: number[] = [];

  const result = await ensureDatabaseReady({
    ping: async () => {
      pings += 1;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    delaysMs: DB_STARTUP_RETRY_DELAYS_MS,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.attempts, 1);
  }
  assert.equal(pings, 1);
  assert.deepEqual(sleeps, []);
}

async function testThirdAttemptSucceeds(): Promise<void> {
  let pings = 0;
  const sleeps: number[] = [];
  const retries: Array<{ attempt: number; delayMs: number }> = [];

  const result = await ensureDatabaseReady({
    ping: async () => {
      pings += 1;
      if (pings < 3) {
        throw p1001(`fail-${pings}`);
      }
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    delaysMs: DB_STARTUP_RETRY_DELAYS_MS,
    logRetry: ({ attempt, delayMs }) => {
      retries.push({ attempt, delayMs });
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.attempts, 3);
  }
  assert.equal(pings, 3);
  assert.deepEqual(sleeps, [1_000, 3_000]);
  assert.deepEqual(retries, [
    { attempt: 1, delayMs: 1_000 },
    { attempt: 2, delayMs: 3_000 },
  ]);
}

async function testAllAttemptsFailWithoutThrow(): Promise<void> {
  let pings = 0;
  const sleeps: number[] = [];

  const result = await ensureDatabaseReady({
    ping: async () => {
      pings += 1;
      throw new PrismaClientInitializationError(`down-${pings}`);
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    delaysMs: DB_STARTUP_RETRY_DELAYS_MS,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, true);
    assert.equal(result.attempts, 5);
  }
  assert.equal(pings, 5);
  assert.deepEqual(sleeps, [1_000, 3_000, 10_000, 30_000]);
}

async function testUnknownErrorLoggedAndNotRetried(): Promise<void> {
  let pings = 0;
  const sleeps: number[] = [];
  const nonRetryableLogs: Array<{ attempt: number; error: string }> = [];

  const result = await ensureDatabaseReady({
    ping: async () => {
      pings += 1;
      throw new Error("programming bug in ping");
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    delaysMs: DB_STARTUP_RETRY_DELAYS_MS,
    logNonRetryable: (fields) => {
      nonRetryableLogs.push(fields);
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.retryable, false);
    assert.equal(result.attempts, 1);
  }
  assert.equal(pings, 1);
  assert.deepEqual(sleeps, []);
  assert.equal(nonRetryableLogs.length, 1);
  assert.equal(nonRetryableLogs[0]?.attempt, 1);
  assert.match(nonRetryableLogs[0]?.error ?? "", /programming bug/);
}

async function run(): Promise<void> {
  runIsRetryableChecks();
  await testDbReadyImmediately();
  await testThirdAttemptSucceeds();
  await testAllAttemptsFailWithoutThrow();
  await testUnknownErrorLoggedAndNotRetried();
  console.log("db-availability unit tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

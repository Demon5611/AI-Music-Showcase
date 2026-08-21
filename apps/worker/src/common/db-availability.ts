import { prisma } from "@ai-music/db";
import { logLoadControl } from "@ai-music/shared";

/** Delays before retries 1..4 after a failed attempt (max 4 retries → 5 attempts). */
export const DB_STARTUP_RETRY_DELAYS_MS = [1_000, 3_000, 10_000, 30_000] as const;

export type DbPing = () => Promise<unknown>;
export type SleepFn = (ms: number) => Promise<void>;

export type DbReadyResult =
  | { ok: true; attempts: number }
  | { ok: false; attempts: number; error: unknown; retryable: boolean };

export type EnsureDatabaseReadyOptions = {
  ping?: DbPing;
  sleep?: SleepFn;
  delaysMs?: readonly number[];
  logRetry?: (fields: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    error: string;
  }) => void;
  logNonRetryable?: (fields: { attempt: number; error: string }) => void;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function pingDatabase(ping: DbPing = defaultDbPing): Promise<void> {
  await ping();
}

async function defaultDbPing(): Promise<unknown> {
  return prisma.$queryRaw`SELECT 1`;
}

/**
 * True for transient Neon / Postgres / Prisma connectivity failures.
 * Programming and unknown errors are not retryable.
 */
export function isRetryableDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as { name?: string; code?: string; message?: string };
  const name = err.name ?? "";
  const code = err.code ?? "";
  const message = (err.message ?? "").toLowerCase();

  if (name === "PrismaClientInitializationError") {
    return true;
  }

  if (
    code === "P1001" ||
    code === "P1002" ||
    code === "P1008" ||
    code === "P1017" ||
    code === "P2024"
  ) {
    return true;
  }

  if (
    message.includes("can't reach database server") ||
    message.includes("server has closed the connection") ||
    message.includes("connection reset") ||
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("enotfound") ||
    message.includes("socket hang up") ||
    message.includes("timed out fetching a new connection")
  ) {
    return true;
  }

  return false;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Wait until Postgres answers `SELECT 1`, with exponential-ish backoff.
 * Never throws: returns `{ ok: false }` after retries or on non-retryable errors.
 */
export async function ensureDatabaseReady(
  options: EnsureDatabaseReadyOptions = {},
): Promise<DbReadyResult> {
  const ping = options.ping ?? defaultDbPing;
  const sleep = options.sleep ?? defaultSleep;
  const delaysMs = options.delaysMs ?? DB_STARTUP_RETRY_DELAYS_MS;
  const maxAttempts = delaysMs.length + 1;

  const logRetry =
    options.logRetry ??
    ((fields) => {
      logLoadControl("worker_db_ping_retry", fields, "warn");
    });

  const logNonRetryable =
    options.logNonRetryable ??
    ((fields) => {
      logLoadControl("worker_db_ping_non_retryable", fields, "error");
    });

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await pingDatabase(ping);
      return { ok: true, attempts: attempt };
    } catch (error) {
      lastError = error;
      const retryable = isRetryableDbError(error);

      if (!retryable) {
        logNonRetryable({ attempt, error: errorMessage(error) });
        return { ok: false, attempts: attempt, error, retryable: false };
      }

      if (attempt >= maxAttempts) {
        break;
      }

      const delayMs = delaysMs[attempt - 1] ?? delaysMs[delaysMs.length - 1]!;
      logRetry({
        attempt,
        maxAttempts,
        delayMs,
        error: errorMessage(error),
      });
      await sleep(delayMs);
    }
  }

  return {
    ok: false,
    attempts: maxAttempts,
    error: lastError,
    retryable: true,
  };
}

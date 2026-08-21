import { Prisma } from "@ai-music/db";

/** Waiters must not hold an interactive transaction while the user credit lock is busy. */
export class CreditLockBusyError extends Error {
  constructor() {
    super("User credit lock is busy");
    this.name = "CreditLockBusyError";
  }
}

/** Bound for lock-busy / P2028 retries. Must stay before provider enqueue. */
export const COMMIT_RETRY_BUDGET_MS = 15_000;
export const COMMIT_RETRY_DELAY_MS = 50;

export function isPrismaInteractiveTransactionGoneError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2028" || error.code === "P2034" || error.code === "P2024")
  );
}

export function isRetryableCommitTransactionError(error: unknown): boolean {
  return error instanceof CreditLockBusyError || isPrismaInteractiveTransactionGoneError(error);
}

export function commitRetryReason(error: unknown): string {
  if (error instanceof CreditLockBusyError) {
    return "credit_lock_busy";
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code;
  }

  return "retryable_tx";
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export type CommitRetryHooks = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: { attempt: number; error: unknown }) => void;
};

export async function runWithCommitTransactionRetry<T>(
  operation: () => Promise<T>,
  hooks: CommitRetryHooks = {},
): Promise<T> {
  const now = hooks.now ?? Date.now;
  const sleep = hooks.sleep ?? defaultSleep;
  const startedAt = now();
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      const elapsedMs = now() - startedAt;
      const canRetry =
        isRetryableCommitTransactionError(error) && elapsedMs < COMMIT_RETRY_BUDGET_MS;

      if (!canRetry) {
        throw error;
      }

      hooks.onRetry?.({ attempt, error });
      await sleep(COMMIT_RETRY_DELAY_MS);
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

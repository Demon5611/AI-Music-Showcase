import { Prisma, type CreditTransaction } from "@prisma/client";
import { CASH_REFUND_REVIEW_REASONS } from "@ai-music/shared";
import { prisma } from "./prisma.js";
import {
  consumeLotsForSpend,
  ensureLotForGrant,
  resolveExactSpendLedgerEntryId,
  restoreLotsForSpend,
} from "./credit-grant-lots.js";
import {
  assertSpendEligibleForCreditCompensation,
  logSpendCreditCompensationBlocked,
  SpendAlreadyCashRefundedError,
} from "./spend-credit-compensation.js";

const CREDIT_UNIT_SCALE = 1000;

export class InsufficientCreditsLedgerError extends Error {
  constructor() {
    super("Insufficient credits");
    this.name = "InsufficientCreditsLedgerError";
  }
}

export { SpendAlreadyCashRefundedError };

export type CreditLedgerInput = {
  userId: string;
  amountUnits: number;
  reason: string;
  idempotencyKey: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Exact original spend key. Required to restore lots on refund; relation tuples are not unique. */
  sourceSpendIdempotencyKey?: string;
};

type LedgerTransactionClient = Prisma.TransactionClient;

export async function getCreditsBalance(userId: string): Promise<number> {
  return (await getCreditsBalanceUnits(userId)) / CREDIT_UNIT_SCALE;
}

export async function getCreditsBalanceUnits(userId: string): Promise<number> {
  const result = await prisma.creditTransaction.aggregate({
    where: { userId },
    _sum: { amountUnits: true },
  });

  return result._sum.amountUnits ?? 0;
}

async function findByIdempotencyKey(
  idempotencyKey: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<CreditTransaction | null> {
  return tx.creditTransaction.findUnique({
    where: { idempotencyKey },
  });
}

async function lockUserCredits(userId: string, tx: LedgerTransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId})::bigint)`;
}

export async function lockUserCreditsInTransaction(
  userId: string,
  tx: LedgerTransactionClient,
): Promise<void> {
  await lockUserCredits(userId, tx);
}

/**
 * Non-blocking per-user credit lock. Waiters must abort the interactive
 * transaction immediately and retry outside it — do not use pg_advisory_xact_lock
 * inside Prisma interactive transactions under concurrency (P2028).
 */
export async function tryLockUserCreditsInTransaction(
  userId: string,
  tx: LedgerTransactionClient,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ locked: unknown }>>`
    SELECT pg_try_advisory_xact_lock(hashtext(${userId})::bigint) AS locked
  `;

  return isPgTrue(rows[0]?.locked);
}

export function isPgTrue(value: unknown): boolean {
  return value === true || value === 1 || value === 1n || value === "t" || value === "true";
}

async function writeLedgerEntry(
  input: CreditLedgerInput & {
    type: "spend" | "refund" | "purchase";
    signedAmountUnits: number;
    checkBalance?: boolean;
  },
  tx: LedgerTransactionClient,
): Promise<CreditTransaction> {
  const duplicate = await findByIdempotencyKey(input.idempotencyKey, tx);

  if (duplicate) {
    if (input.type === "purchase") {
      await ensureLotForGrant(tx, {
        id: duplicate.id,
        userId: duplicate.userId,
        amountUnits: duplicate.amountUnits,
        relatedEntityType: duplicate.relatedEntityType,
        relatedEntityId: duplicate.relatedEntityId,
        createdAt: duplicate.createdAt,
      });
    }
    if (input.type === "refund") {
      // Restore is defensive (cashRefundRequestId claim); never create a second ledger row.
      await restoreLotsForExactSourceSpend(tx, input);
    }
    return duplicate;
  }

  let balanceBeforeSpend = 0;

  if (input.checkBalance) {
    await lockUserCredits(input.userId, tx);

    const result = await tx.creditTransaction.aggregate({
      where: { userId: input.userId },
      _sum: { amountUnits: true },
    });
    const balanceUnits = result._sum.amountUnits ?? 0;
    balanceBeforeSpend = balanceUnits;

    // Spend authorization uses ledger total only. Refund workflow / merchant
    // reserves must not freeze user-available credits.
    if (balanceUnits < input.amountUnits) {
      throw new InsufficientCreditsLedgerError();
    }
  }

  // Credit refund: lock + cash XOR guard MUST run before ledger mutation.
  // restoreLots alone cannot close double-compensation (ledger create is earlier).
  if (input.type === "refund") {
    await lockUserCredits(input.userId, tx);
    const spendId = await resolveExactSpendLedgerEntryId(tx, {
      userId: input.userId,
      sourceSpendIdempotencyKey: input.sourceSpendIdempotencyKey,
    });
    if (spendId) {
      try {
        await assertSpendEligibleForCreditCompensation(tx, {
          spendLedgerEntryId: spendId,
        });
      } catch (error) {
        if (error instanceof SpendAlreadyCashRefundedError) {
          logSpendCreditCompensationBlocked({
            userId: input.userId,
            spendLedgerEntryId: spendId,
            refundIdempotencyKey: input.idempotencyKey,
          });
        }
        throw error;
      }
    }
  }

  const created = await tx.creditTransaction.create({
    data: {
      userId: input.userId,
      type: input.type,
      amountUnits: input.signedAmountUnits,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
    },
  });

  if (input.type === "purchase") {
    await ensureLotForGrant(tx, {
      id: created.id,
      userId: created.userId,
      amountUnits: created.amountUnits,
      relatedEntityType: created.relatedEntityType,
      relatedEntityId: created.relatedEntityId,
      createdAt: created.createdAt,
    });
  }

  if (input.type === "spend") {
    try {
      await consumeLotsForSpend(tx, {
        userId: input.userId,
        spendId: created.id,
        amountUnits: input.amountUnits,
        ledgerBalanceBeforeSpend: balanceBeforeSpend,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "CREDIT_LOT_CONSUME_FAILED") {
        throw new InsufficientCreditsLedgerError();
      }
      throw error;
    }
  }

  if (input.type === "refund") {
    await restoreLotsForExactSourceSpend(tx, input);
  }

  return created;
}

async function restoreLotsForExactSourceSpend(
  tx: LedgerTransactionClient,
  input: Pick<CreditLedgerInput, "userId" | "sourceSpendIdempotencyKey">,
): Promise<void> {
  await lockUserCredits(input.userId, tx);
  const spendId = await resolveExactSpendLedgerEntryId(tx, {
    userId: input.userId,
    sourceSpendIdempotencyKey: input.sourceSpendIdempotencyKey,
  });
  if (!spendId) {
    return;
  }
  await restoreLotsForSpend(tx, spendId);
}

async function writeIdempotentTransaction(
  input: CreditLedgerInput & {
    type: "spend" | "refund" | "purchase";
    signedAmountUnits: number;
    checkBalance?: boolean;
  },
): Promise<CreditTransaction> {
  const existing = await findByIdempotencyKey(input.idempotencyKey);

  if (existing) {
    // Do not create lots for historical grants on retry — fail closed for pack refund.
    if (input.type === "refund") {
      await prisma.$transaction(async (tx) => {
        await restoreLotsForExactSourceSpend(tx, input);
      });
    }
    return existing;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      return writeLedgerEntry(input, tx);
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const duplicate = await findByIdempotencyKey(input.idempotencyKey);

      if (duplicate) {
        if (input.type === "refund") {
          await prisma.$transaction(async (tx) => {
            await restoreLotsForExactSourceSpend(tx, input);
          });
        }
        return duplicate;
      }
    }

    throw error;
  }
}

export async function spendCredits(input: CreditLedgerInput): Promise<CreditTransaction> {
  return writeIdempotentTransaction({
    ...input,
    type: "spend",
    signedAmountUnits: -input.amountUnits,
    checkBalance: true,
  });
}

export async function spendCreditsInTransaction(
  input: CreditLedgerInput,
  tx: LedgerTransactionClient,
): Promise<CreditTransaction> {
  return writeLedgerEntry(
    {
      ...input,
      type: "spend",
      signedAmountUnits: -input.amountUnits,
      checkBalance: true,
    },
    tx,
  );
}

export async function refundCredits(input: CreditLedgerInput): Promise<CreditTransaction | null> {
  try {
    return await writeIdempotentTransaction({
      ...input,
      type: "refund",
      signedAmountUnits: input.amountUnits,
    });
  } catch (error) {
    if (error instanceof SpendAlreadyCashRefundedError) {
      return null;
    }
    throw error;
  }
}

export async function refundCreditsInTransaction(
  input: CreditLedgerInput,
  tx: LedgerTransactionClient,
): Promise<CreditTransaction | null> {
  try {
    return await writeLedgerEntry(
      {
        ...input,
        type: "refund",
        signedAmountUnits: input.amountUnits,
      },
      tx,
    );
  } catch (error) {
    if (error instanceof SpendAlreadyCashRefundedError) {
      // Logged in writeLedgerEntry before throw.
      return null;
    }
    throw error;
  }
}

export async function grantCredits(input: CreditLedgerInput): Promise<CreditTransaction> {
  return writeIdempotentTransaction({
    ...input,
    type: "purchase",
    signedAmountUnits: input.amountUnits,
  });
}

export async function grantCreditsInTransaction(
  input: CreditLedgerInput,
  tx: LedgerTransactionClient,
): Promise<CreditTransaction> {
  return writeLedgerEntry(
    {
      ...input,
      type: "purchase",
      signedAmountUnits: input.amountUnits,
    },
    tx,
  );
}

/** @deprecated Use spendCredits with idempotencyKey. Returns true if newly created. */
export async function spendCreditsOnce(
  userId: string,
  amountUnits: number,
  idempotencyKey: string,
  reason = idempotencyKey,
): Promise<boolean> {
  const before = await findByIdempotencyKey(idempotencyKey);

  if (before) {
    return false;
  }

  await spendCredits({ userId, amountUnits, reason, idempotencyKey });
  return true;
}

/** @deprecated Use refundCredits with idempotencyKey. Returns true if newly created. */
export async function refundCreditsOnce(
  userId: string,
  amountUnits: number,
  idempotencyKey: string,
  reason = idempotencyKey,
): Promise<boolean> {
  const before = await findByIdempotencyKey(idempotencyKey);

  if (before) {
    return false;
  }

  const created = await refundCredits({ userId, amountUnits, reason, idempotencyKey });
  return created != null;
}

export type RefundOriginalSpendInput = {
  userId: string;
  spendIdempotencyKey: string;
  refundIdempotencyKey: string;
  reason: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
};

export type RefundOriginalSpendResult = {
  /** True when a refund ledger row exists after this call (including prior idempotent refund). */
  refunded: boolean;
  /** Absolute units refunded from the original spend; null if spend row missing. */
  amountUnits: number | null;
  /**
   * Set when system credit compensation must not run (cash refund XOR).
   * Terminal/no-op for workers — not a retryable failure.
   */
  blockedReason?: string;
};

/**
 * Resolve refund units from a ledger spend row's signed amount.
 * Never use the current OPERATION_COST_* price table.
 */
export function resolveOriginalSpendRefundUnits(
  spendAmountUnits: number | null | undefined,
): number | null {
  if (spendAmountUnits == null || spendAmountUnits >= 0) {
    return null;
  }

  return Math.abs(spendAmountUnits);
}

/**
 * Refund the exact amount charged on the spend ledger row.
 * Safe across OPERATION_COST_UNITS price changes — never re-read the global price table.
 * No-op when the exact spend already has an in-flight/succeeded operation cash refund.
 */
export async function refundOriginalSpend(
  input: RefundOriginalSpendInput,
): Promise<RefundOriginalSpendResult> {
  const spend = await findByIdempotencyKey(input.spendIdempotencyKey);
  const existingRefund = await findByIdempotencyKey(input.refundIdempotencyKey);
  const amountUnits = existingRefund
    ? Math.abs(existingRefund.amountUnits)
    : resolveOriginalSpendRefundUnits(spend?.amountUnits);

  if (amountUnits === null) {
    return { refunded: false, amountUnits: null };
  }

  if (amountUnits === 0) {
    return { refunded: false, amountUnits: 0 };
  }

  // Prior credit refund already exists — idempotent success (lots restore is defensive).
  if (existingRefund) {
    await refundCredits({
      userId: input.userId,
      amountUnits,
      reason: input.reason,
      idempotencyKey: input.refundIdempotencyKey,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      sourceSpendIdempotencyKey: input.spendIdempotencyKey,
    });
    return { refunded: true, amountUnits };
  }

  const created = await refundCredits({
    userId: input.userId,
    amountUnits,
    reason: input.reason,
    idempotencyKey: input.refundIdempotencyKey,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId,
    sourceSpendIdempotencyKey: input.spendIdempotencyKey,
  });

  if (!created) {
    return {
      refunded: false,
      amountUnits: 0,
      blockedReason: CASH_REFUND_REVIEW_REASONS.operationAlreadyCashRefunded,
    };
  }

  return { refunded: true, amountUnits };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export { CREDIT_UNIT_SCALE };

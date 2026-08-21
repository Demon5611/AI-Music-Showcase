import {
  getCreditsBalance as getLedgerBalance,
  getCreditsBalanceUnits as getLedgerBalanceUnits,
  InsufficientCreditsLedgerError,
  refundCredits as refundLedgerCredits,
  refundCreditsOnce as refundLedgerCreditsOnce,
  refundOriginalSpend as refundLedgerOriginalSpend,
  spendCredits as spendLedgerCredits,
  spendCreditsOnce as spendLedgerCreditsOnce,
  type CreditLedgerInput,
  type RefundOriginalSpendInput,
  type RefundOriginalSpendResult,
} from "@ai-music/db";
import { InsufficientCreditsError } from "../../common/errors.js";

export type { CreditLedgerInput, RefundOriginalSpendInput, RefundOriginalSpendResult };

export async function getCreditsBalance(userId: string): Promise<number> {
  return getLedgerBalance(userId);
}

export async function getCreditsBalanceUnits(userId: string): Promise<number> {
  return getLedgerBalanceUnits(userId);
}

function mapInsufficientCredits(error: unknown): never {
  if (error instanceof InsufficientCreditsLedgerError) {
    throw new InsufficientCreditsError();
  }

  throw error;
}

export async function spendCredits(input: CreditLedgerInput) {
  try {
    return await spendLedgerCredits(input);
  } catch (error) {
    mapInsufficientCredits(error);
  }
}

export async function spendCreditsOnce(
  userId: string,
  amountUnits: number,
  idempotencyKey: string,
  reason = idempotencyKey,
): Promise<boolean> {
  try {
    return await spendLedgerCreditsOnce(userId, amountUnits, idempotencyKey, reason);
  } catch (error) {
    mapInsufficientCredits(error);
  }
}

export async function refundCredits(input: CreditLedgerInput) {
  return refundLedgerCredits(input);
}

export async function refundCreditsOnce(
  userId: string,
  amountUnits: number,
  idempotencyKey: string,
  reason = idempotencyKey,
): Promise<boolean> {
  return refundLedgerCreditsOnce(userId, amountUnits, idempotencyKey, reason);
}

/** Prefer over refundCreditsOnce(currentConstant) after price changes. */
export async function refundOriginalSpend(
  input: RefundOriginalSpendInput,
): Promise<RefundOriginalSpendResult> {
  return refundLedgerOriginalSpend(input);
}

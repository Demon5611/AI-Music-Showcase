import type { CreditPackPurchase } from "@ai-music/db";
import type { TbcPaymentDetails } from "./tbc-client.js";

export type TbcAmountCurrencyVerification =
  | { ok: true }
  | {
      ok: false;
      reason: "pay_id_mismatch" | "amount_mismatch" | "currency_mismatch";
      expected: { payId: string; amount: number; currency: string };
      actual: { payId: string; amount: number; currency: string };
    };

function toMajorAmount(value: { toString(): string } | number | string): number {
  return Number(value);
}

/**
 * Fail-closed amount/currency/payId check before any credit grant.
 */
export function verifyTbcPaymentAgainstPurchase(
  purchase: Pick<
    CreditPackPurchase,
    "providerPaymentId" | "priceAmount" | "currency"
  >,
  payment: Pick<TbcPaymentDetails, "payId" | "amount" | "currency">,
): TbcAmountCurrencyVerification {
  const expectedPayId = purchase.providerPaymentId ?? "";
  const expectedAmount = toMajorAmount(purchase.priceAmount);
  const expectedCurrency = purchase.currency.toUpperCase();
  const actualCurrency = payment.currency.toUpperCase();

  const expected = {
    payId: expectedPayId,
    amount: expectedAmount,
    currency: expectedCurrency,
  };
  const actual = {
    payId: payment.payId,
    amount: payment.amount,
    currency: actualCurrency,
  };

  if (!expectedPayId || payment.payId !== expectedPayId) {
    return { ok: false, reason: "pay_id_mismatch", expected, actual };
  }

  if (!Number.isFinite(expectedAmount) || payment.amount !== expectedAmount) {
    return { ok: false, reason: "amount_mismatch", expected, actual };
  }

  if (actualCurrency !== expectedCurrency) {
    return { ok: false, reason: "currency_mismatch", expected, actual };
  }

  return { ok: true };
}

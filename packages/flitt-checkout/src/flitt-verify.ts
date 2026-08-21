import type { CreditPackPurchase } from "@ai-music/db";
import { majorStringToFlittMinorUnits } from "./flitt-amount.js";
import type { FlittCheckoutRuntimeConfig } from "./flitt-config.js";
import type { FlittOrderStatusResult } from "./flitt-client.js";

export type FlittAmountCurrencyVerification =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "order_id_mismatch"
        | "payment_id_mismatch"
        | "merchant_id_mismatch"
        | "amount_mismatch"
        | "currency_mismatch";
      expected: {
        orderId: string;
        paymentId: string;
        merchantId: string;
        amountMinor: number;
        currency: string;
      };
      actual: {
        orderId: string;
        paymentId: string;
        merchantId: string;
        amountMinor: number | null;
        currency: string;
      };
    };

function parseMerchantId(value: string): string {
  return value.trim();
}

/**
 * Fail-closed order/payment/merchant/amount/currency check before any credit grant.
 * Compares Flitt integer amount (tetri) against purchase snapshot major units.
 */
export function verifyFlittPaymentAgainstPurchase(
  purchase: Pick<
    CreditPackPurchase,
    "merchantPaymentId" | "providerPaymentId" | "priceAmount" | "currency"
  >,
  payment: Pick<
    FlittOrderStatusResult,
    "orderId" | "paymentId" | "merchantId" | "amountMinor" | "actualAmountMinor" | "currency"
  >,
  config: Pick<FlittCheckoutRuntimeConfig, "merchantId">,
): FlittAmountCurrencyVerification {
  const expectedOrderId = purchase.merchantPaymentId;
  const expectedPaymentId = purchase.providerPaymentId ?? "";
  const expectedAmountMinor = majorStringToFlittMinorUnits(purchase.priceAmount.toString());
  const expectedCurrency = purchase.currency.toUpperCase();
  const expectedMerchantId = String(config.merchantId);

  const chargedMinor = payment.actualAmountMinor ?? payment.amountMinor;

  const expected = {
    orderId: expectedOrderId,
    paymentId: expectedPaymentId,
    merchantId: expectedMerchantId,
    amountMinor: expectedAmountMinor,
    currency: expectedCurrency,
  };
  const actual = {
    orderId: payment.orderId,
    paymentId: payment.paymentId,
    merchantId: parseMerchantId(payment.merchantId),
    amountMinor: chargedMinor,
    currency: payment.currency.toUpperCase(),
  };

  if (!expectedOrderId || payment.orderId !== expectedOrderId) {
    return { ok: false, reason: "order_id_mismatch", expected, actual };
  }

  if (expectedPaymentId && payment.paymentId !== expectedPaymentId) {
    return { ok: false, reason: "payment_id_mismatch", expected, actual };
  }

  if (!payment.paymentId) {
    return { ok: false, reason: "payment_id_mismatch", expected, actual };
  }

  if (actual.merchantId !== expectedMerchantId) {
    return { ok: false, reason: "merchant_id_mismatch", expected, actual };
  }

  if (
    chargedMinor === null ||
    !Number.isFinite(expectedAmountMinor) ||
    chargedMinor !== expectedAmountMinor ||
    payment.amountMinor !== expectedAmountMinor
  ) {
    return { ok: false, reason: "amount_mismatch", expected, actual };
  }

  if (actual.currency !== expectedCurrency) {
    return { ok: false, reason: "currency_mismatch", expected, actual };
  }

  return { ok: true };
}

export function readFlittCallbackOrderId(payload: Record<string, unknown>): string | null {
  const orderId = payload.order_id;
  if (typeof orderId === "string" && orderId.trim()) {
    return orderId.trim();
  }
  return null;
}

export function readFlittCallbackPaymentId(payload: Record<string, unknown>): string | null {
  const paymentId = payload.payment_id;
  if (typeof paymentId === "string" && paymentId.trim()) {
    return paymentId.trim();
  }
  if (typeof paymentId === "number" && Number.isFinite(paymentId)) {
    return String(paymentId);
  }
  return null;
}

export function readFlittCallbackOrderStatus(payload: Record<string, unknown>): string | null {
  const status = payload.order_status;
  return typeof status === "string" && status.trim() ? status.trim() : null;
}

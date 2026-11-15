import { CHECKOUTGATEWAY_PAYMENT_PROVIDER } from "./checkoutgateway-checkout.js";

/**
 * Active checkout selector (`PAYMENT_PROVIDER`).
 * New purchases are Checkoutgateway-only. `legacygateway` and unknown values fail closed.
 */
export const CHECKOUT_PAYMENT_PROVIDERS = [CHECKOUTGATEWAY_PAYMENT_PROVIDER] as const;

export type CheckoutPaymentProvider = (typeof CHECKOUT_PAYMENT_PROVIDERS)[number];

export function parseCheckoutPaymentProvider(
  value: string | undefined | null,
): CheckoutPaymentProvider | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === CHECKOUTGATEWAY_PAYMENT_PROVIDER) {
    return normalized;
  }
  return null;
}

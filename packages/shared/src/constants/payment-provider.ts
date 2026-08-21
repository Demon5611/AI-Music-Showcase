import { FLITT_PAYMENT_PROVIDER } from "./flitt-checkout.js";

/**
 * Active checkout selector (`PAYMENT_PROVIDER`).
 * New purchases are Flitt-only. `tbc` and unknown values fail closed.
 */
export const CHECKOUT_PAYMENT_PROVIDERS = [FLITT_PAYMENT_PROVIDER] as const;

export type CheckoutPaymentProvider = (typeof CHECKOUT_PAYMENT_PROVIDERS)[number];

export function parseCheckoutPaymentProvider(
  value: string | undefined | null,
): CheckoutPaymentProvider | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === FLITT_PAYMENT_PROVIDER) {
    return normalized;
  }
  return null;
}

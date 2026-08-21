import type { CreditPackageId } from "./credit-packages.js";

/** Purchasable prepaid pack ids (Free is not checkoutable). */
export const PURCHASABLE_CREDIT_PACKAGE_IDS = [
  "starter",
  "creator",
  "studio",
] as const satisfies readonly CreditPackageId[];

export type PurchasableCreditPackageId = (typeof PURCHASABLE_CREDIT_PACKAGE_IDS)[number];

export const CREDIT_PACK_PURCHASE_STATUSES = [
  "created",
  "provider_created",
  "pending",
  "paid",
  "credited",
  "failed",
  "expired",
  "cancelled",
  "refunded",
  "partial_refunded",
  "verification_failed",
] as const;

export type CreditPackPurchaseStatus = (typeof CREDIT_PACK_PURCHASE_STATUSES)[number];

export const TBC_PAYMENT_PROVIDER = "tbc" as const;

export const TBC_CHECKOUT_CURRENCIES = ["USD", "GEL", "EUR"] as const;
export type TbcCheckoutCurrency = (typeof TBC_CHECKOUT_CURRENCIES)[number];

/** TBC Checkout language codes we may send (product locales map into these). */
export const TBC_CHECKOUT_LANGUAGES = ["KA", "EN"] as const;
export type TbcCheckoutLanguage = (typeof TBC_CHECKOUT_LANGUAGES)[number];

export const TBC_CHECKOUT_EXPIRATION_MINUTES = 12;

/** Max description length accepted by TBC create payment. */
export const TBC_PAYMENT_DESCRIPTION_MAX_LEN = 30;

export function isPurchasableCreditPackageId(
  value: string,
): value is PurchasableCreditPackageId {
  return (PURCHASABLE_CREDIT_PACKAGE_IDS as readonly string[]).includes(value);
}

/** Redirect target from backend approvalUrl must be https before the browser follows it. */
export function isHttpsAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function mapAppLocaleToTbcLanguage(locale: string | undefined): TbcCheckoutLanguage {
  // Product locales: en | ru. TBC Checkout: KA | EN. Never send RU.
  void locale;
  return "EN";
}

export function buildTbcCreditGrantIdempotencyKey(providerPaymentId: string): string {
  return `tbc_payment:${providerPaymentId}:credit_grant`;
}

export function buildCreditPackPurchaseDescription(
  packageName: string,
  credits: number,
): string {
  const raw = `${packageName} - ${credits} credits`;
  if (raw.length <= TBC_PAYMENT_DESCRIPTION_MAX_LEN) {
    return raw;
  }

  return raw.slice(0, TBC_PAYMENT_DESCRIPTION_MAX_LEN);
}

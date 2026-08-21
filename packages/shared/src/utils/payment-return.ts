/** Query key we set on Flitt `response_url`. UX only — never payment proof. */
export const PAYMENT_RETURN_PURCHASE_ID_QUERY = "purchaseId";

/** Flitt browser return may include merchant `order_id` (= our purchase id). */
export const PAYMENT_RETURN_ORDER_ID_QUERY = "order_id";

export const PAYMENT_RETURN_PAGE_SLUG = "payment-return";
export const PAYMENT_RETURN_API_PATH = "/api/payment-return";

export const PAYMENT_RETURN_LOCALES = ["en", "ru", "ka"] as const;
export type PaymentReturnLocale = (typeof PAYMENT_RETURN_LOCALES)[number];

const PURCHASE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

const PAYMENT_RETURN_FAILURE_STATUSES = new Set([
  "failed",
  "expired",
  "cancelled",
  "verification_failed",
  "refunded",
  "partial_refunded",
]);

export type PaymentReturnUxState = "pending" | "success" | "failed";

export type PaymentReturnParamSource = {
  get(name: string): string | null;
};

export function isPaymentReturnPurchaseId(value: string): boolean {
  return PURCHASE_ID_PATTERN.test(value);
}

export function readPaymentReturnPurchaseId(
  source: PaymentReturnParamSource,
): string | null {
  const purchaseId = source.get(PAYMENT_RETURN_PURCHASE_ID_QUERY)?.trim() ?? "";
  if (isPaymentReturnPurchaseId(purchaseId)) {
    return purchaseId;
  }

  const orderId = source.get(PAYMENT_RETURN_ORDER_ID_QUERY)?.trim() ?? "";
  if (isPaymentReturnPurchaseId(orderId)) {
    return orderId;
  }

  return null;
}

export function paymentReturnParamsFromRecord(
  record: Record<string, unknown>,
): PaymentReturnParamSource {
  return {
    get(name: string) {
      const value = record[name];
      if (typeof value === "string") {
        return value;
      }
      if (Array.isArray(value) && typeof value[0] === "string") {
        return value[0];
      }
      return null;
    },
  };
}

/**
 * Flitt `response_url` must carry only our purchase id.
 * Drops signature / amount / card fields if they were present on the base URL.
 */
export function appendPurchaseIdToReturnUrl(
  baseReturnUrl: string,
  purchaseId: string,
): string {
  if (!isPaymentReturnPurchaseId(purchaseId)) {
    throw new Error("Invalid purchase id for return URL");
  }

  const url = new URL(baseReturnUrl);
  for (const key of [...url.searchParams.keys()]) {
    url.searchParams.delete(key);
  }
  url.searchParams.set(PAYMENT_RETURN_PURCHASE_ID_QUERY, purchaseId);
  return url.toString();
}

export function isPaymentReturnApiPath(pathname: string): boolean {
  return pathname === PAYMENT_RETURN_API_PATH || pathname === `${PAYMENT_RETURN_API_PATH}/`;
}

export function isLocalePaymentReturnPath(pathname: string): boolean {
  return /^\/(en|ru|ka)\/payment-return\/?$/.test(pathname);
}

/** Previous Flitt env pointed here; POST must not hit Clerk/pricing GET-only. */
export function isLegacyPricingReturnPath(pathname: string): boolean {
  return /^\/(en|ru|ka)\/pricing\/?$/.test(pathname);
}

export function isPaymentReturnLocale(value: string): value is PaymentReturnLocale {
  return (PAYMENT_RETURN_LOCALES as readonly string[]).includes(value);
}

export function buildPaymentReturnPagePath(
  locale: PaymentReturnLocale,
  purchaseId: string | null,
): string {
  const path = `/${locale}/${PAYMENT_RETURN_PAGE_SLUG}`;
  if (!purchaseId) {
    return path;
  }
  const params = new URLSearchParams();
  params.set(PAYMENT_RETURN_PURCHASE_ID_QUERY, purchaseId);
  return `${path}?${params.toString()}`;
}

export function resolvePaymentReturnUxState(
  status: string | undefined,
): PaymentReturnUxState {
  if (!status) {
    return "pending";
  }
  if (status === "credited") {
    return "success";
  }
  if (PAYMENT_RETURN_FAILURE_STATUSES.has(status)) {
    return "failed";
  }
  return "pending";
}

export function isPaymentReturnTerminalStatus(status: string | undefined): boolean {
  return resolvePaymentReturnUxState(status) !== "pending";
}

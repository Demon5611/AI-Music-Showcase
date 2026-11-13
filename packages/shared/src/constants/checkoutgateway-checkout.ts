import { createBullMqJobId } from "./bullmq-job-id.js";

export const CHECKOUTGATEWAY_PAYMENT_PROVIDER = "checkoutgateway" as const;

export const CHECKOUTGATEWAY_CHECKOUT_CURRENCIES = ["GEL"] as const;
export type CheckoutgatewayCheckoutCurrency = (typeof CHECKOUTGATEWAY_CHECKOUT_CURRENCIES)[number];

/** Official hosted checkout / API host. SSRF allow-list. */
export const CHECKOUTGATEWAY_API_HOSTS = ["pay.integration.example.invalid"] as const;

export const CHECKOUTGATEWAY_DEFAULT_API_BASE_URL = "https://pay.integration.example.invalid";

/**
 * Checkoutgateway public test merchant from https://docs.integration.example.invalid/api/testing .
 * Not a secret. Live vs test is merchant-status on Checkoutgateway, not APP_ENV.
 */
export const CHECKOUTGATEWAY_PUBLIC_TEST_MERCHANT_ID = 1_549_901;

/** Canonical production API callback. Required when APP_ENV=production and Checkoutgateway is enabled. */
export const CHECKOUTGATEWAY_PRODUCTION_CALLBACK_URL =
  "https://api.example.com/api/billing/checkoutgateway/callback";

/** Canonical production browser return (UX only; never grants). */
export const CHECKOUTGATEWAY_PRODUCTION_RETURN_URL = "https://example.com/api/payment-return";

export const CHECKOUTGATEWAY_PRODUCTION_CALLBACK_HOST = "api.example.com";
export const CHECKOUTGATEWAY_PRODUCTION_RETURN_HOSTS = ["example.com", "www.example.com"] as const;
export const CHECKOUTGATEWAY_PRODUCTION_CALLBACK_PATH = "/api/billing/checkoutgateway/callback";
export const CHECKOUTGATEWAY_PRODUCTION_RETURN_PATH = "/api/payment-return";

export const CHECKOUTGATEWAY_PROTOCOL_VERSION = "1.0.1";

/**
 * Production checkout gate: USD SoT + USD→GEL FX snapshot + tetri rounding
 * are approved for live charging. Default false. Independent of CHECKOUTGATEWAY_ENABLED.
 */
export const CHECKOUTGATEWAY_DEMO_PRICING_CONFIGURED = true;

/** GEL tetri (ISO 4217 exponent 2). */
export const CHECKOUTGATEWAY_MINOR_UNITS_EXPONENT = 2;

export function buildCheckoutgatewayCreditGrantIdempotencyKey(providerPaymentId: string): string {
  return `checkoutgateway_payment:${providerPaymentId}:credit_grant`;
}

export const CHECKOUTGATEWAY_REFUND_QUEUE_NAME = "checkoutgateway-refund";
export const CHECKOUTGATEWAY_REFUND_JOB_NAME = "checkoutgateway-refund";
export const CHECKOUTGATEWAY_REFUND_ATTEMPTS_DEFAULT = 5;
export const CHECKOUTGATEWAY_REFUND_BACKOFF_MS_DEFAULT = 5_000;

export type CheckoutgatewayRefundJobPayload = {
  refundRequestId: string;
};

/** Deterministic BullMQ jobId — no colon separators. */
export function checkoutgatewayRefundJobId(refundRequestId: string): string {
  return createBullMqJobId("checkoutgateway-refund", refundRequestId);
}

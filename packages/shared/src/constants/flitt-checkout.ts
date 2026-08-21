import { createBullMqJobId } from "./bullmq-job-id.js";

export const FLITT_PAYMENT_PROVIDER = "flitt" as const;

export const FLITT_CHECKOUT_CURRENCIES = ["GEL"] as const;
export type FlittCheckoutCurrency = (typeof FLITT_CHECKOUT_CURRENCIES)[number];

/** Official hosted checkout / API host. SSRF allow-list. */
export const FLITT_API_HOSTS = ["pay.flitt.com"] as const;

export const FLITT_DEFAULT_API_BASE_URL = "https://pay.flitt.com";

/**
 * Flitt public test merchant from https://docs.flitt.com/api/testing .
 * Not a secret. Live vs test is merchant-status on Flitt, not APP_ENV.
 */
export const FLITT_PUBLIC_TEST_MERCHANT_ID = 1_549_901;

/** Canonical production API callback. Required when APP_ENV=production and Flitt is enabled. */
export const FLITT_PRODUCTION_CALLBACK_URL =
  "https://api.example.com/api/billing/flitt/callback";

/** Canonical production browser return (UX only; never grants). */
export const FLITT_PRODUCTION_RETURN_URL = "https://example.com/api/payment-return";

export const FLITT_PRODUCTION_CALLBACK_HOST = "api.example.com";
export const FLITT_PRODUCTION_RETURN_HOSTS = ["example.com", "www.example.com"] as const;
export const FLITT_PRODUCTION_CALLBACK_PATH = "/api/billing/flitt/callback";
export const FLITT_PRODUCTION_RETURN_PATH = "/api/payment-return";

export const FLITT_PROTOCOL_VERSION = "1.0.1";

/**
 * Production checkout gate: USD SoT + USD→GEL FX snapshot + tetri rounding
 * are approved for live charging. Default false. Independent of FLITT_ENABLED.
 */
export const FLITT_PRODUCTION_PRICING_APPROVED = true;

/** GEL tetri (ISO 4217 exponent 2). */
export const FLITT_MINOR_UNITS_EXPONENT = 2;

export function buildFlittCreditGrantIdempotencyKey(providerPaymentId: string): string {
  return `flitt_payment:${providerPaymentId}:credit_grant`;
}

export const FLITT_REFUND_QUEUE_NAME = "flitt-refund";
export const FLITT_REFUND_JOB_NAME = "flitt-refund";
export const FLITT_REFUND_ATTEMPTS_DEFAULT = 5;
export const FLITT_REFUND_BACKOFF_MS_DEFAULT = 5_000;

export type FlittRefundJobPayload = {
  refundRequestId: string;
};

/** Deterministic BullMQ jobId — no colon separators. */
export function flittRefundJobId(refundRequestId: string): string {
  return createBullMqJobId("flitt-refund", refundRequestId);
}

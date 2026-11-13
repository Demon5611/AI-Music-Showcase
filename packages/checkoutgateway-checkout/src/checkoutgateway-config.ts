import {
  CHECKOUTGATEWAY_API_HOSTS,
  CHECKOUTGATEWAY_CHECKOUT_CURRENCIES,
  CHECKOUTGATEWAY_DEFAULT_API_BASE_URL,
  CHECKOUTGATEWAY_PRODUCTION_CALLBACK_HOST,
  CHECKOUTGATEWAY_PRODUCTION_CALLBACK_PATH,
  CHECKOUTGATEWAY_DEMO_PRICING_CONFIGURED,
  CHECKOUTGATEWAY_PRODUCTION_RETURN_HOSTS,
  CHECKOUTGATEWAY_PRODUCTION_RETURN_PATH,
  CHECKOUTGATEWAY_PUBLIC_TEST_MERCHANT_ID,
  type CheckoutgatewayCheckoutCurrency,
} from "@ai-music/shared";
import { CheckoutgatewayCheckoutError } from "./checkoutgateway-errors.js";
import { assertTrustedCheckoutgatewayApiBaseUrl } from "./checkoutgateway-checkout-url.js";

export { CheckoutgatewayCheckoutError };

export type CheckoutgatewayProviderEnvBag = {
  APP_ENV?: string;
  CHECKOUTGATEWAY_ENABLED?: boolean;
  CHECKOUTGATEWAY_API_BASE_URL?: string;
  CHECKOUTGATEWAY_MERCHANT_ID?: string;
  CHECKOUTGATEWAY_PAYMENT_KEY?: string;
  CHECKOUTGATEWAY_CURRENCY?: string;
  /**
   * Test-only override. Runtime API/worker env does not expose this —
   * production charging uses CHECKOUTGATEWAY_DEMO_PRICING_CONFIGURED.
   */
  CHECKOUTGATEWAY_DEMO_PRICING_CONFIGURED?: boolean;
};

export type CheckoutgatewayCheckoutEnvBag = CheckoutgatewayProviderEnvBag & {
  CHECKOUTGATEWAY_CALLBACK_URL?: string;
  CHECKOUTGATEWAY_RETURN_URL?: string;
};

export type CheckoutgatewayProviderRuntimeConfig = {
  enabled: boolean;
  apiBaseUrl: string;
  merchantId: number;
  paymentKey: string;
  currency: CheckoutgatewayCheckoutCurrency;
};

export type CheckoutgatewayCheckoutRuntimeConfig = CheckoutgatewayProviderRuntimeConfig & {
  callbackUrl: string;
  returnUrl: string;
};

const TRUSTED_API_HOSTS = new Set<string>(CHECKOUTGATEWAY_API_HOSTS);
const PRODUCTION_RETURN_HOSTS = new Set<string>(CHECKOUTGATEWAY_PRODUCTION_RETURN_HOSTS);

function requireHttpsAbsoluteUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new CheckoutgatewayCheckoutError(`Invalid ${name}`, "configuration", {
      code: "CHECKOUTGATEWAY_INVALID_URL",
    });
  }

  if (parsed.protocol !== "https:") {
    throw new CheckoutgatewayCheckoutError(`${name} must be https`, "configuration", {
      code: "CHECKOUTGATEWAY_URL_NOT_HTTPS",
    });
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw new CheckoutgatewayCheckoutError(`${name} must not include credentials`, "configuration", {
      code: "CHECKOUTGATEWAY_URL_HAS_CREDENTIALS",
    });
  }

  return parsed.toString().replace(/\/$/, "");
}

function readProcessEnvBag(): CheckoutgatewayCheckoutEnvBag {
  return {
    APP_ENV: process.env.APP_ENV,
    CHECKOUTGATEWAY_ENABLED: process.env.CHECKOUTGATEWAY_ENABLED === "true",
    CHECKOUTGATEWAY_API_BASE_URL: process.env.CHECKOUTGATEWAY_API_BASE_URL,
    CHECKOUTGATEWAY_MERCHANT_ID: process.env.CHECKOUTGATEWAY_MERCHANT_ID,
    CHECKOUTGATEWAY_PAYMENT_KEY: process.env.CHECKOUTGATEWAY_PAYMENT_KEY,
    CHECKOUTGATEWAY_CURRENCY: process.env.CHECKOUTGATEWAY_CURRENCY,
    CHECKOUTGATEWAY_CALLBACK_URL: process.env.CHECKOUTGATEWAY_CALLBACK_URL,
    CHECKOUTGATEWAY_RETURN_URL: process.env.CHECKOUTGATEWAY_RETURN_URL,
  };
}

function parseMerchantId(raw: string): number {
  if (!/^\d{1,12}$/.test(raw)) {
    throw new CheckoutgatewayCheckoutError("CHECKOUTGATEWAY_MERCHANT_ID must be a numeric merchant id", "configuration", {
      code: "CHECKOUTGATEWAY_MERCHANT_ID_INVALID",
    });
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CheckoutgatewayCheckoutError("CHECKOUTGATEWAY_MERCHANT_ID must be a positive integer", "configuration", {
      code: "CHECKOUTGATEWAY_MERCHANT_ID_INVALID",
    });
  }
  return parsed;
}

function readAppEnv(env: CheckoutgatewayProviderEnvBag): string {
  return (env.APP_ENV ?? process.env.APP_ENV ?? "development").trim().toLowerCase();
}

function isBlockedRuntimeHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return true;
  }
  if (host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (host.includes("staging")) {
    return true;
  }
  return false;
}

function assertProductionCheckoutUrls(callbackUrl: string, returnUrl: string): void {
  const callback = new URL(callbackUrl);
  const returnParsed = new URL(returnUrl);

  if (isBlockedRuntimeHost(callback.hostname) || isBlockedRuntimeHost(returnParsed.hostname)) {
    throw new CheckoutgatewayCheckoutError(
      "Production Checkoutgateway URLs must not use localhost or staging hosts",
      "configuration",
      { code: "CHECKOUTGATEWAY_PRODUCTION_URL_FORBIDDEN" },
    );
  }

  if (
    callback.hostname !== CHECKOUTGATEWAY_PRODUCTION_CALLBACK_HOST ||
    callback.pathname !== CHECKOUTGATEWAY_PRODUCTION_CALLBACK_PATH
  ) {
    throw new CheckoutgatewayCheckoutError(
      "CHECKOUTGATEWAY_CALLBACK_URL must be the production API Checkoutgateway callback",
      "configuration",
      { code: "CHECKOUTGATEWAY_PRODUCTION_CALLBACK_URL_INVALID" },
    );
  }

  if (
    !PRODUCTION_RETURN_HOSTS.has(returnParsed.hostname) ||
    returnParsed.pathname !== CHECKOUTGATEWAY_PRODUCTION_RETURN_PATH
  ) {
    throw new CheckoutgatewayCheckoutError(
      "CHECKOUTGATEWAY_RETURN_URL must be the production /api/payment-return URL",
      "configuration",
      { code: "CHECKOUTGATEWAY_PRODUCTION_RETURN_URL_INVALID" },
    );
  }
}

function assertProductionMerchant(merchantId: number): void {
  if (merchantId === CHECKOUTGATEWAY_PUBLIC_TEST_MERCHANT_ID) {
    throw new CheckoutgatewayCheckoutError(
      "Checkoutgateway public test merchant is not allowed when APP_ENV=production",
      "configuration",
      { code: "CHECKOUTGATEWAY_TEST_MERCHANT_IN_PRODUCTION" },
    );
  }
}

function assertProductionPricingApproved(env: CheckoutgatewayProviderEnvBag): void {
  const approved = env.CHECKOUTGATEWAY_DEMO_PRICING_CONFIGURED ?? CHECKOUTGATEWAY_DEMO_PRICING_CONFIGURED;
  if (!approved) {
    throw new CheckoutgatewayCheckoutError(
      "Production Checkoutgateway checkout requires approved USD→GEL pricing policy",
      "configuration",
      { code: "CHECKOUTGATEWAY_PRODUCTION_PRICING_NOT_APPROVED" },
    );
  }
}

function resolveApiBaseUrl(env: CheckoutgatewayProviderEnvBag): string {
  const apiBaseRaw = (env.CHECKOUTGATEWAY_API_BASE_URL?.trim() || CHECKOUTGATEWAY_DEFAULT_API_BASE_URL).replace(
    /\/$/,
    "",
  );

  try {
    const parsed = assertTrustedCheckoutgatewayApiBaseUrl(apiBaseRaw, "CHECKOUTGATEWAY_API_BASE_URL");
    if (!TRUSTED_API_HOSTS.has(parsed.hostname)) {
      throw new Error("untrusted host");
    }
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch (error) {
    throw new CheckoutgatewayCheckoutError(
      error instanceof Error ? error.message : "Invalid CHECKOUTGATEWAY_API_BASE_URL",
      "configuration",
      { code: "CHECKOUTGATEWAY_API_BASE_URL_UNTRUSTED" },
    );
  }
}

function resolveCurrency(env: CheckoutgatewayProviderEnvBag): CheckoutgatewayCheckoutCurrency {
  const currency = (env.CHECKOUTGATEWAY_CURRENCY ?? "GEL").toUpperCase();
  if (!(CHECKOUTGATEWAY_CHECKOUT_CURRENCIES as readonly string[]).includes(currency)) {
    throw new CheckoutgatewayCheckoutError(
      `Unsupported CHECKOUTGATEWAY_CURRENCY: ${currency}`,
      "configuration",
      { code: "CHECKOUTGATEWAY_CURRENCY_UNSUPPORTED" },
    );
  }
  return currency as CheckoutgatewayCheckoutCurrency;
}

/**
 * Merchant + API credentials for status/refund.
 * Does not require checkout callback/return URLs.
 */
export function resolveCheckoutgatewayProviderConfig(
  env: CheckoutgatewayProviderEnvBag = readProcessEnvBag(),
): CheckoutgatewayProviderRuntimeConfig | null {
  if (!env.CHECKOUTGATEWAY_ENABLED) {
    return null;
  }

  const missing: string[] = [];
  for (const key of ["CHECKOUTGATEWAY_MERCHANT_ID", "CHECKOUTGATEWAY_PAYMENT_KEY"] as const) {
    if (!env[key]?.trim()) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new CheckoutgatewayCheckoutError(
      `Checkoutgateway enabled but missing: ${missing.join(", ")}`,
      "configuration",
      { code: "CHECKOUTGATEWAY_CONFIG_INCOMPLETE" },
    );
  }

  const merchantId = parseMerchantId(env.CHECKOUTGATEWAY_MERCHANT_ID!.trim());
  const paymentKey = env.CHECKOUTGATEWAY_PAYMENT_KEY!.trim();
  if (paymentKey.length < 4) {
    throw new CheckoutgatewayCheckoutError("CHECKOUTGATEWAY_PAYMENT_KEY is invalid", "configuration", {
      code: "CHECKOUTGATEWAY_PAYMENT_KEY_INVALID",
    });
  }

  const appEnv = readAppEnv(env);
  if (appEnv === "production") {
    assertProductionMerchant(merchantId);
  }

  return {
    enabled: true,
    apiBaseUrl: resolveApiBaseUrl(env),
    merchantId,
    paymentKey,
    currency: resolveCurrency(env),
  };
}

export function resolveCheckoutgatewayCheckoutConfig(
  env: CheckoutgatewayCheckoutEnvBag = readProcessEnvBag(),
): CheckoutgatewayCheckoutRuntimeConfig | null {
  const provider = resolveCheckoutgatewayProviderConfig(env);
  if (!provider) {
    return null;
  }

  const missing: string[] = [];
  for (const key of ["CHECKOUTGATEWAY_CALLBACK_URL", "CHECKOUTGATEWAY_RETURN_URL"] as const) {
    if (!env[key]?.trim()) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new CheckoutgatewayCheckoutError(
      `Checkoutgateway checkout enabled but missing: ${missing.join(", ")}`,
      "configuration",
      { code: "CHECKOUTGATEWAY_CONFIG_INCOMPLETE" },
    );
  }

  const callbackUrl = requireHttpsAbsoluteUrl(env.CHECKOUTGATEWAY_CALLBACK_URL!, "CHECKOUTGATEWAY_CALLBACK_URL");
  const returnUrl = requireHttpsAbsoluteUrl(env.CHECKOUTGATEWAY_RETURN_URL!, "CHECKOUTGATEWAY_RETURN_URL");

  const appEnv = readAppEnv(env);
  if (appEnv === "production") {
    assertProductionCheckoutUrls(callbackUrl, returnUrl);
    assertProductionPricingApproved(env);
  }

  return {
    ...provider,
    callbackUrl,
    returnUrl,
  };
}

export function assertCheckoutgatewayProviderEnabled(
  env?: CheckoutgatewayProviderEnvBag,
): CheckoutgatewayProviderRuntimeConfig {
  const config = resolveCheckoutgatewayProviderConfig(env);
  if (!config) {
    throw new CheckoutgatewayCheckoutError("Checkoutgateway is disabled", "configuration", {
      code: "CHECKOUTGATEWAY_CHECKOUT_DISABLED",
    });
  }
  return config;
}

export function assertCheckoutgatewayCheckoutEnabled(
  env?: CheckoutgatewayCheckoutEnvBag,
): CheckoutgatewayCheckoutRuntimeConfig {
  const config = resolveCheckoutgatewayCheckoutConfig(env);
  if (!config) {
    throw new CheckoutgatewayCheckoutError("Checkoutgateway checkout is disabled", "configuration", {
      code: "CHECKOUTGATEWAY_CHECKOUT_DISABLED",
    });
  }
  return config;
}

/**
 * Safe public readiness: disabled, incomplete, or production-unsafe → false.
 * Never returns credentials.
 */
export function isCheckoutgatewayCheckoutReady(env?: CheckoutgatewayCheckoutEnvBag): boolean {
  try {
    return resolveCheckoutgatewayCheckoutConfig(env) !== null;
  } catch {
    return false;
  }
}

/** Worker/status/refund readiness. Does not require callback/return URLs. */
export function isCheckoutgatewayProviderReady(env?: CheckoutgatewayProviderEnvBag): boolean {
  try {
    return resolveCheckoutgatewayProviderConfig(env) !== null;
  } catch {
    return false;
  }
}

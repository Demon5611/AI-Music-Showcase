import {
  FLITT_API_HOSTS,
  FLITT_CHECKOUT_CURRENCIES,
  FLITT_DEFAULT_API_BASE_URL,
  FLITT_PRODUCTION_CALLBACK_HOST,
  FLITT_PRODUCTION_CALLBACK_PATH,
  FLITT_PRODUCTION_PRICING_APPROVED,
  FLITT_PRODUCTION_RETURN_HOSTS,
  FLITT_PRODUCTION_RETURN_PATH,
  FLITT_PUBLIC_TEST_MERCHANT_ID,
  type FlittCheckoutCurrency,
} from "@ai-music/shared";
import { FlittCheckoutError } from "./flitt-errors.js";
import { assertTrustedFlittApiBaseUrl } from "./flitt-checkout-url.js";

export { FlittCheckoutError };

export type FlittProviderEnvBag = {
  APP_ENV?: string;
  FLITT_ENABLED?: boolean;
  FLITT_API_BASE_URL?: string;
  FLITT_MERCHANT_ID?: string;
  FLITT_PAYMENT_KEY?: string;
  FLITT_CURRENCY?: string;
  /**
   * Test-only override. Runtime API/worker env does not expose this —
   * production charging uses FLITT_PRODUCTION_PRICING_APPROVED.
   */
  FLITT_PRODUCTION_PRICING_APPROVED?: boolean;
};

export type FlittCheckoutEnvBag = FlittProviderEnvBag & {
  FLITT_CALLBACK_URL?: string;
  FLITT_RETURN_URL?: string;
};

export type FlittProviderRuntimeConfig = {
  enabled: boolean;
  apiBaseUrl: string;
  merchantId: number;
  paymentKey: string;
  currency: FlittCheckoutCurrency;
};

export type FlittCheckoutRuntimeConfig = FlittProviderRuntimeConfig & {
  callbackUrl: string;
  returnUrl: string;
};

const TRUSTED_API_HOSTS = new Set<string>(FLITT_API_HOSTS);
const PRODUCTION_RETURN_HOSTS = new Set<string>(FLITT_PRODUCTION_RETURN_HOSTS);

function requireHttpsAbsoluteUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new FlittCheckoutError(`Invalid ${name}`, "configuration", {
      code: "FLITT_INVALID_URL",
    });
  }

  if (parsed.protocol !== "https:") {
    throw new FlittCheckoutError(`${name} must be https`, "configuration", {
      code: "FLITT_URL_NOT_HTTPS",
    });
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw new FlittCheckoutError(`${name} must not include credentials`, "configuration", {
      code: "FLITT_URL_HAS_CREDENTIALS",
    });
  }

  return parsed.toString().replace(/\/$/, "");
}

function readProcessEnvBag(): FlittCheckoutEnvBag {
  return {
    APP_ENV: process.env.APP_ENV,
    FLITT_ENABLED: process.env.FLITT_ENABLED === "true",
    FLITT_API_BASE_URL: process.env.FLITT_API_BASE_URL,
    FLITT_MERCHANT_ID: process.env.FLITT_MERCHANT_ID,
    FLITT_PAYMENT_KEY: process.env.FLITT_PAYMENT_KEY,
    FLITT_CURRENCY: process.env.FLITT_CURRENCY,
    FLITT_CALLBACK_URL: process.env.FLITT_CALLBACK_URL,
    FLITT_RETURN_URL: process.env.FLITT_RETURN_URL,
  };
}

function parseMerchantId(raw: string): number {
  if (!/^\d{1,12}$/.test(raw)) {
    throw new FlittCheckoutError("FLITT_MERCHANT_ID must be a numeric merchant id", "configuration", {
      code: "FLITT_MERCHANT_ID_INVALID",
    });
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new FlittCheckoutError("FLITT_MERCHANT_ID must be a positive integer", "configuration", {
      code: "FLITT_MERCHANT_ID_INVALID",
    });
  }
  return parsed;
}

function readAppEnv(env: FlittProviderEnvBag): string {
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
    throw new FlittCheckoutError(
      "Production Flitt URLs must not use localhost or staging hosts",
      "configuration",
      { code: "FLITT_PRODUCTION_URL_FORBIDDEN" },
    );
  }

  if (
    callback.hostname !== FLITT_PRODUCTION_CALLBACK_HOST ||
    callback.pathname !== FLITT_PRODUCTION_CALLBACK_PATH
  ) {
    throw new FlittCheckoutError(
      "FLITT_CALLBACK_URL must be the production API Flitt callback",
      "configuration",
      { code: "FLITT_PRODUCTION_CALLBACK_URL_INVALID" },
    );
  }

  if (
    !PRODUCTION_RETURN_HOSTS.has(returnParsed.hostname) ||
    returnParsed.pathname !== FLITT_PRODUCTION_RETURN_PATH
  ) {
    throw new FlittCheckoutError(
      "FLITT_RETURN_URL must be the production /api/payment-return URL",
      "configuration",
      { code: "FLITT_PRODUCTION_RETURN_URL_INVALID" },
    );
  }
}

function assertProductionMerchant(merchantId: number): void {
  if (merchantId === FLITT_PUBLIC_TEST_MERCHANT_ID) {
    throw new FlittCheckoutError(
      "Flitt public test merchant is not allowed when APP_ENV=production",
      "configuration",
      { code: "FLITT_TEST_MERCHANT_IN_PRODUCTION" },
    );
  }
}

function assertProductionPricingApproved(env: FlittProviderEnvBag): void {
  const approved = env.FLITT_PRODUCTION_PRICING_APPROVED ?? FLITT_PRODUCTION_PRICING_APPROVED;
  if (!approved) {
    throw new FlittCheckoutError(
      "Production Flitt checkout requires approved USD→GEL pricing policy",
      "configuration",
      { code: "FLITT_PRODUCTION_PRICING_NOT_APPROVED" },
    );
  }
}

function resolveApiBaseUrl(env: FlittProviderEnvBag): string {
  const apiBaseRaw = (env.FLITT_API_BASE_URL?.trim() || FLITT_DEFAULT_API_BASE_URL).replace(
    /\/$/,
    "",
  );

  try {
    const parsed = assertTrustedFlittApiBaseUrl(apiBaseRaw, "FLITT_API_BASE_URL");
    if (!TRUSTED_API_HOSTS.has(parsed.hostname)) {
      throw new Error("untrusted host");
    }
    return `${parsed.protocol}//${parsed.hostname}`;
  } catch (error) {
    throw new FlittCheckoutError(
      error instanceof Error ? error.message : "Invalid FLITT_API_BASE_URL",
      "configuration",
      { code: "FLITT_API_BASE_URL_UNTRUSTED" },
    );
  }
}

function resolveCurrency(env: FlittProviderEnvBag): FlittCheckoutCurrency {
  const currency = (env.FLITT_CURRENCY ?? "GEL").toUpperCase();
  if (!(FLITT_CHECKOUT_CURRENCIES as readonly string[]).includes(currency)) {
    throw new FlittCheckoutError(
      `Unsupported FLITT_CURRENCY: ${currency}`,
      "configuration",
      { code: "FLITT_CURRENCY_UNSUPPORTED" },
    );
  }
  return currency as FlittCheckoutCurrency;
}

/**
 * Merchant + API credentials for status/refund.
 * Does not require checkout callback/return URLs.
 */
export function resolveFlittProviderConfig(
  env: FlittProviderEnvBag = readProcessEnvBag(),
): FlittProviderRuntimeConfig | null {
  if (!env.FLITT_ENABLED) {
    return null;
  }

  const missing: string[] = [];
  for (const key of ["FLITT_MERCHANT_ID", "FLITT_PAYMENT_KEY"] as const) {
    if (!env[key]?.trim()) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new FlittCheckoutError(
      `Flitt enabled but missing: ${missing.join(", ")}`,
      "configuration",
      { code: "FLITT_CONFIG_INCOMPLETE" },
    );
  }

  const merchantId = parseMerchantId(env.FLITT_MERCHANT_ID!.trim());
  const paymentKey = env.FLITT_PAYMENT_KEY!.trim();
  if (paymentKey.length < 4) {
    throw new FlittCheckoutError("FLITT_PAYMENT_KEY is invalid", "configuration", {
      code: "FLITT_PAYMENT_KEY_INVALID",
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

export function resolveFlittCheckoutConfig(
  env: FlittCheckoutEnvBag = readProcessEnvBag(),
): FlittCheckoutRuntimeConfig | null {
  const provider = resolveFlittProviderConfig(env);
  if (!provider) {
    return null;
  }

  const missing: string[] = [];
  for (const key of ["FLITT_CALLBACK_URL", "FLITT_RETURN_URL"] as const) {
    if (!env[key]?.trim()) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new FlittCheckoutError(
      `Flitt checkout enabled but missing: ${missing.join(", ")}`,
      "configuration",
      { code: "FLITT_CONFIG_INCOMPLETE" },
    );
  }

  const callbackUrl = requireHttpsAbsoluteUrl(env.FLITT_CALLBACK_URL!, "FLITT_CALLBACK_URL");
  const returnUrl = requireHttpsAbsoluteUrl(env.FLITT_RETURN_URL!, "FLITT_RETURN_URL");

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

export function assertFlittProviderEnabled(
  env?: FlittProviderEnvBag,
): FlittProviderRuntimeConfig {
  const config = resolveFlittProviderConfig(env);
  if (!config) {
    throw new FlittCheckoutError("Flitt is disabled", "configuration", {
      code: "FLITT_CHECKOUT_DISABLED",
    });
  }
  return config;
}

export function assertFlittCheckoutEnabled(
  env?: FlittCheckoutEnvBag,
): FlittCheckoutRuntimeConfig {
  const config = resolveFlittCheckoutConfig(env);
  if (!config) {
    throw new FlittCheckoutError("Flitt checkout is disabled", "configuration", {
      code: "FLITT_CHECKOUT_DISABLED",
    });
  }
  return config;
}

/**
 * Safe public readiness: disabled, incomplete, or production-unsafe → false.
 * Never returns credentials.
 */
export function isFlittCheckoutReady(env?: FlittCheckoutEnvBag): boolean {
  try {
    return resolveFlittCheckoutConfig(env) !== null;
  } catch {
    return false;
  }
}

/** Worker/status/refund readiness. Does not require callback/return URLs. */
export function isFlittProviderReady(env?: FlittProviderEnvBag): boolean {
  try {
    return resolveFlittProviderConfig(env) !== null;
  } catch {
    return false;
  }
}

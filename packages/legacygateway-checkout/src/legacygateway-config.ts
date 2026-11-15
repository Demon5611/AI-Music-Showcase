import {
  LEGACYGATEWAY_CHECKOUT_CURRENCIES,
  type LegacygatewayCheckoutCurrency,
  type LegacygatewayCheckoutLanguage,
} from "@ai-music/shared";
import { LegacygatewayCheckoutError } from "./legacygateway-errors.js";

export type LegacygatewayCheckoutEnvBag = {
  LEGACYGATEWAY_CHECKOUT_ENABLED?: boolean;
  LEGACYGATEWAY_API_BASE_URL?: string;
  LEGACYGATEWAY_CHECKOUT_API_VERSION?: string;
  LEGACYGATEWAY_API_KEY?: string;
  LEGACYGATEWAY_CLIENT_ID?: string;
  LEGACYGATEWAY_CLIENT_SECRET?: string;
  LEGACYGATEWAY_CHECKOUT_CURRENCY?: string;
  LEGACYGATEWAY_CALLBACK_URL?: string;
  LEGACYGATEWAY_RETURN_URL?: string;
};

export type LegacygatewayCheckoutRuntimeConfig = {
  enabled: boolean;
  apiBaseUrl: string;
  apiVersion: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
  currency: LegacygatewayCheckoutCurrency;
  callbackUrl: string;
  returnUrl: string;
};

function requireHttpsAbsoluteUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new LegacygatewayCheckoutError(`Invalid ${name}`, "configuration", {
      code: "LEGACYGATEWAY_INVALID_URL",
    });
  }

  if (parsed.protocol !== "https:") {
    throw new LegacygatewayCheckoutError(`${name} must be https`, "configuration", {
      code: "LEGACYGATEWAY_URL_NOT_HTTPS",
    });
  }

  return parsed.toString().replace(/\/$/, "");
}

function readProcessEnvBag(): LegacygatewayCheckoutEnvBag {
  return {
    LEGACYGATEWAY_CHECKOUT_ENABLED: process.env.LEGACYGATEWAY_CHECKOUT_ENABLED === "true",
    LEGACYGATEWAY_API_BASE_URL: process.env.LEGACYGATEWAY_API_BASE_URL,
    LEGACYGATEWAY_CHECKOUT_API_VERSION: process.env.LEGACYGATEWAY_CHECKOUT_API_VERSION,
    LEGACYGATEWAY_API_KEY: process.env.LEGACYGATEWAY_API_KEY,
    LEGACYGATEWAY_CLIENT_ID: process.env.LEGACYGATEWAY_CLIENT_ID,
    LEGACYGATEWAY_CLIENT_SECRET: process.env.LEGACYGATEWAY_CLIENT_SECRET,
    LEGACYGATEWAY_CHECKOUT_CURRENCY: process.env.LEGACYGATEWAY_CHECKOUT_CURRENCY,
    LEGACYGATEWAY_CALLBACK_URL: process.env.LEGACYGATEWAY_CALLBACK_URL,
    LEGACYGATEWAY_RETURN_URL: process.env.LEGACYGATEWAY_RETURN_URL,
  };
}

export function resolveLegacygatewayCheckoutConfig(
  env: LegacygatewayCheckoutEnvBag = readProcessEnvBag(),
): LegacygatewayCheckoutRuntimeConfig | null {
  if (!env.LEGACYGATEWAY_CHECKOUT_ENABLED) {
    return null;
  }

  const missing: string[] = [];
  for (const key of [
    "LEGACYGATEWAY_API_BASE_URL",
    "LEGACYGATEWAY_CHECKOUT_API_VERSION",
    "LEGACYGATEWAY_API_KEY",
    "LEGACYGATEWAY_CLIENT_ID",
    "LEGACYGATEWAY_CLIENT_SECRET",
    "LEGACYGATEWAY_CALLBACK_URL",
    "LEGACYGATEWAY_RETURN_URL",
  ] as const) {
    if (!env[key]?.trim()) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new LegacygatewayCheckoutError(
      `LEGACYGATEWAY Checkout enabled but missing: ${missing.join(", ")}`,
      "configuration",
      { code: "LEGACYGATEWAY_CONFIG_INCOMPLETE" },
    );
  }

  const currency = (env.LEGACYGATEWAY_CHECKOUT_CURRENCY ?? "USD").toUpperCase();
  if (!(LEGACYGATEWAY_CHECKOUT_CURRENCIES as readonly string[]).includes(currency)) {
    throw new LegacygatewayCheckoutError(
      `Unsupported LEGACYGATEWAY_CHECKOUT_CURRENCY: ${currency}`,
      "configuration",
      { code: "LEGACYGATEWAY_CURRENCY_UNSUPPORTED" },
    );
  }

  const apiBaseUrl = requireHttpsAbsoluteUrl(env.LEGACYGATEWAY_API_BASE_URL!, "LEGACYGATEWAY_API_BASE_URL");
  const callbackUrl = requireHttpsAbsoluteUrl(env.LEGACYGATEWAY_CALLBACK_URL!, "LEGACYGATEWAY_CALLBACK_URL");
  const returnUrl = requireHttpsAbsoluteUrl(env.LEGACYGATEWAY_RETURN_URL!, "LEGACYGATEWAY_RETURN_URL");
  const apiVersion = env.LEGACYGATEWAY_CHECKOUT_API_VERSION!.trim();
  if (!apiVersion) {
    throw new LegacygatewayCheckoutError("LEGACYGATEWAY_CHECKOUT_API_VERSION is required", "configuration", {
      code: "LEGACYGATEWAY_API_VERSION_MISSING",
    });
  }

  return {
    enabled: true,
    apiBaseUrl,
    apiVersion,
    apiKey: env.LEGACYGATEWAY_API_KEY!.trim(),
    clientId: env.LEGACYGATEWAY_CLIENT_ID!.trim(),
    clientSecret: env.LEGACYGATEWAY_CLIENT_SECRET!.trim(),
    currency: currency as LegacygatewayCheckoutCurrency,
    callbackUrl,
    returnUrl,
  };
}

export function assertLegacygatewayCheckoutEnabled(
  env?: LegacygatewayCheckoutEnvBag,
): LegacygatewayCheckoutRuntimeConfig {
  const config = resolveLegacygatewayCheckoutConfig(env);
  if (!config) {
    throw new LegacygatewayCheckoutError("LEGACYGATEWAY Checkout is disabled", "configuration", {
      code: "LEGACYGATEWAY_CHECKOUT_DISABLED",
    });
  }
  return config;
}

/**
 * Safe public readiness: disabled or incomplete config → false.
 * Never returns credentials.
 */
export function isLegacygatewayCheckoutReady(env?: LegacygatewayCheckoutEnvBag): boolean {
  try {
    return resolveLegacygatewayCheckoutConfig(env) !== null;
  } catch {
    return false;
  }
}

export type LegacygatewayCreatePaymentInput = {
  amount: { currency: LegacygatewayCheckoutCurrency; total: number };
  returnurl: string;
  callbackUrl: string;
  merchantPaymentId: string;
  description: string;
  language: LegacygatewayCheckoutLanguage;
  expirationMinutes: number;
  preAuth: false;
  saveCard?: false;
};

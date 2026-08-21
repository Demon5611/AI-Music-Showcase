import {
  TBC_CHECKOUT_CURRENCIES,
  type TbcCheckoutCurrency,
  type TbcCheckoutLanguage,
} from "@ai-music/shared";
import { TbcCheckoutError } from "./tbc-errors.js";

export type TbcCheckoutEnvBag = {
  TBC_CHECKOUT_ENABLED?: boolean;
  TBC_API_BASE_URL?: string;
  TBC_CHECKOUT_API_VERSION?: string;
  TBC_API_KEY?: string;
  TBC_CLIENT_ID?: string;
  TBC_CLIENT_SECRET?: string;
  TBC_CHECKOUT_CURRENCY?: string;
  TBC_CALLBACK_URL?: string;
  TBC_RETURN_URL?: string;
};

export type TbcCheckoutRuntimeConfig = {
  enabled: boolean;
  apiBaseUrl: string;
  apiVersion: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
  currency: TbcCheckoutCurrency;
  callbackUrl: string;
  returnUrl: string;
};

function requireHttpsAbsoluteUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TbcCheckoutError(`Invalid ${name}`, "configuration", {
      code: "TBC_INVALID_URL",
    });
  }

  if (parsed.protocol !== "https:") {
    throw new TbcCheckoutError(`${name} must be https`, "configuration", {
      code: "TBC_URL_NOT_HTTPS",
    });
  }

  return parsed.toString().replace(/\/$/, "");
}

function readProcessEnvBag(): TbcCheckoutEnvBag {
  return {
    TBC_CHECKOUT_ENABLED: process.env.TBC_CHECKOUT_ENABLED === "true",
    TBC_API_BASE_URL: process.env.TBC_API_BASE_URL,
    TBC_CHECKOUT_API_VERSION: process.env.TBC_CHECKOUT_API_VERSION,
    TBC_API_KEY: process.env.TBC_API_KEY,
    TBC_CLIENT_ID: process.env.TBC_CLIENT_ID,
    TBC_CLIENT_SECRET: process.env.TBC_CLIENT_SECRET,
    TBC_CHECKOUT_CURRENCY: process.env.TBC_CHECKOUT_CURRENCY,
    TBC_CALLBACK_URL: process.env.TBC_CALLBACK_URL,
    TBC_RETURN_URL: process.env.TBC_RETURN_URL,
  };
}

export function resolveTbcCheckoutConfig(
  env: TbcCheckoutEnvBag = readProcessEnvBag(),
): TbcCheckoutRuntimeConfig | null {
  if (!env.TBC_CHECKOUT_ENABLED) {
    return null;
  }

  const missing: string[] = [];
  for (const key of [
    "TBC_API_BASE_URL",
    "TBC_CHECKOUT_API_VERSION",
    "TBC_API_KEY",
    "TBC_CLIENT_ID",
    "TBC_CLIENT_SECRET",
    "TBC_CALLBACK_URL",
    "TBC_RETURN_URL",
  ] as const) {
    if (!env[key]?.trim()) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new TbcCheckoutError(
      `TBC Checkout enabled but missing: ${missing.join(", ")}`,
      "configuration",
      { code: "TBC_CONFIG_INCOMPLETE" },
    );
  }

  const currency = (env.TBC_CHECKOUT_CURRENCY ?? "USD").toUpperCase();
  if (!(TBC_CHECKOUT_CURRENCIES as readonly string[]).includes(currency)) {
    throw new TbcCheckoutError(
      `Unsupported TBC_CHECKOUT_CURRENCY: ${currency}`,
      "configuration",
      { code: "TBC_CURRENCY_UNSUPPORTED" },
    );
  }

  const apiBaseUrl = requireHttpsAbsoluteUrl(env.TBC_API_BASE_URL!, "TBC_API_BASE_URL");
  const callbackUrl = requireHttpsAbsoluteUrl(env.TBC_CALLBACK_URL!, "TBC_CALLBACK_URL");
  const returnUrl = requireHttpsAbsoluteUrl(env.TBC_RETURN_URL!, "TBC_RETURN_URL");
  const apiVersion = env.TBC_CHECKOUT_API_VERSION!.trim();
  if (!apiVersion) {
    throw new TbcCheckoutError("TBC_CHECKOUT_API_VERSION is required", "configuration", {
      code: "TBC_API_VERSION_MISSING",
    });
  }

  return {
    enabled: true,
    apiBaseUrl,
    apiVersion,
    apiKey: env.TBC_API_KEY!.trim(),
    clientId: env.TBC_CLIENT_ID!.trim(),
    clientSecret: env.TBC_CLIENT_SECRET!.trim(),
    currency: currency as TbcCheckoutCurrency,
    callbackUrl,
    returnUrl,
  };
}

export function assertTbcCheckoutEnabled(
  env?: TbcCheckoutEnvBag,
): TbcCheckoutRuntimeConfig {
  const config = resolveTbcCheckoutConfig(env);
  if (!config) {
    throw new TbcCheckoutError("TBC Checkout is disabled", "configuration", {
      code: "TBC_CHECKOUT_DISABLED",
    });
  }
  return config;
}

/**
 * Safe public readiness: disabled or incomplete config → false.
 * Never returns credentials.
 */
export function isTbcCheckoutReady(env?: TbcCheckoutEnvBag): boolean {
  try {
    return resolveTbcCheckoutConfig(env) !== null;
  } catch {
    return false;
  }
}

export type TbcCreatePaymentInput = {
  amount: { currency: TbcCheckoutCurrency; total: number };
  returnurl: string;
  callbackUrl: string;
  merchantPaymentId: string;
  description: string;
  language: TbcCheckoutLanguage;
  expirationMinutes: number;
  preAuth: false;
  saveCard?: false;
};

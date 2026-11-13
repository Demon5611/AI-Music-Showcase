import {
  CHECKOUTGATEWAY_PAYMENT_PROVIDER,
  parseCheckoutPaymentProvider,
  type CheckoutPaymentProvider,
} from "@ai-music/shared";
import {
  isCheckoutgatewayCheckoutReady,
  type CheckoutgatewayCheckoutEnvBag,
} from "./providers/checkoutgateway.js";
import type { LegacygatewayCheckoutEnvBag } from "./providers/legacygateway.js";

export type CheckoutSelectionEnv = LegacygatewayCheckoutEnvBag &
  CheckoutgatewayCheckoutEnvBag & {
    PAYMENT_PROVIDER?: string;
    FX_USD_GEL_PROVIDER?: string;
  };

function readPaymentProviderRaw(env?: CheckoutSelectionEnv): string | undefined {
  return env ? env.PAYMENT_PROVIDER : process.env.PAYMENT_PROVIDER;
}

/**
 * Unset → Checkoutgateway-only (allowed). `checkoutgateway` → allowed.
 * `legacygateway` / unknown → fail closed. When `env` is passed, do not leak process.env.
 */
export function isCheckoutSelectorAllowed(env?: CheckoutSelectionEnv): boolean {
  const raw = readPaymentProviderRaw(env);
  const trimmed = raw?.trim();
  if (!trimmed) {
    return true;
  }
  return parseCheckoutPaymentProvider(trimmed) === CHECKOUTGATEWAY_PAYMENT_PROVIDER;
}

/**
 * Active checkout provider, or null when checkout is disabled.
 * Never returns `legacygateway`.
 */
export function resolveConfiguredCheckoutProvider(
  env?: CheckoutSelectionEnv,
): CheckoutPaymentProvider | null {
  if (!isConfiguredCheckoutEnabled(env)) {
    return null;
  }
  return CHECKOUTGATEWAY_PAYMENT_PROVIDER;
}

/**
 * CTA / POST checkout gate.
 * Enabled only when the selector allows Checkoutgateway and Checkoutgateway config is ready.
 * LEGACYGATEWAY env must never enable checkout.
 */
export function isConfiguredCheckoutEnabled(env?: CheckoutSelectionEnv): boolean {
  if (!isCheckoutSelectorAllowed(env)) {
    return false;
  }
  return isCheckoutgatewayCheckoutReady(env);
}

import {
  FLITT_PAYMENT_PROVIDER,
  parseCheckoutPaymentProvider,
  type CheckoutPaymentProvider,
} from "@ai-music/shared";
import {
  isFlittCheckoutReady,
  type FlittCheckoutEnvBag,
} from "./providers/flitt.js";
import type { TbcCheckoutEnvBag } from "./providers/tbc.js";

export type CheckoutSelectionEnv = TbcCheckoutEnvBag &
  FlittCheckoutEnvBag & {
    PAYMENT_PROVIDER?: string;
    FX_USD_GEL_PROVIDER?: string;
  };

function readPaymentProviderRaw(env?: CheckoutSelectionEnv): string | undefined {
  return env ? env.PAYMENT_PROVIDER : process.env.PAYMENT_PROVIDER;
}

/**
 * Unset → Flitt-only (allowed). `flitt` → allowed.
 * `tbc` / unknown → fail closed. When `env` is passed, do not leak process.env.
 */
export function isCheckoutSelectorAllowed(env?: CheckoutSelectionEnv): boolean {
  const raw = readPaymentProviderRaw(env);
  const trimmed = raw?.trim();
  if (!trimmed) {
    return true;
  }
  return parseCheckoutPaymentProvider(trimmed) === FLITT_PAYMENT_PROVIDER;
}

/**
 * Active checkout provider, or null when checkout is disabled.
 * Never returns `tbc`.
 */
export function resolveConfiguredCheckoutProvider(
  env?: CheckoutSelectionEnv,
): CheckoutPaymentProvider | null {
  if (!isConfiguredCheckoutEnabled(env)) {
    return null;
  }
  return FLITT_PAYMENT_PROVIDER;
}

/**
 * CTA / POST checkout gate.
 * Enabled only when the selector allows Flitt and Flitt config is ready.
 * TBC env must never enable checkout.
 */
export function isConfiguredCheckoutEnabled(env?: CheckoutSelectionEnv): boolean {
  if (!isCheckoutSelectorAllowed(env)) {
    return false;
  }
  return isFlittCheckoutReady(env);
}

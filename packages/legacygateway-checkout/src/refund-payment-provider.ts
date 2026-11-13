import {
  isProductionRuntimeEnvironment,
  isShowcaseMode,
  resolveAppRuntimeEnv,
  type LegacygatewayRefundProviderMode,
} from "@ai-music/shared";
import { MockLegacygatewayPaymentProvider } from "./mock-legacygateway-payment-provider.js";
import { LegacygatewayPaymentProvider, type LegacygatewayRefundInput } from "./legacygateway-payment-provider.js";
import type { LegacygatewayPaymentDetails } from "./legacygateway-client.js";

/**
 * Shared surface for real LEGACYGATEWAY + staging/dev mock adapters.
 * Worker/API must not call api.legacygatewaybank.ge when mode=mock.
 */
export type RefundPaymentProvider = {
  getPaymentDetails(providerPaymentId: string): Promise<LegacygatewayPaymentDetails>;
  refund(input: LegacygatewayRefundInput): Promise<{ providerReference: string | null }>;
};

export function resolveLegacygatewayRefundProviderMode(
  env: NodeJS.ProcessEnv = process.env,
): LegacygatewayRefundProviderMode {
  if (isShowcaseMode(env)) {
    return "mock";
  }

  const raw = (env.LEGACYGATEWAY_REFUND_PROVIDER_MODE ?? "real").trim().toLowerCase();
  const mode: LegacygatewayRefundProviderMode = raw === "mock" ? "mock" : raw === "real" ? "real" : "real";

  if (raw !== "real" && raw !== "mock" && raw.length > 0) {
    throw new Error(
      `Invalid LEGACYGATEWAY_REFUND_PROVIDER_MODE=${raw} (expected real|mock)`,
    );
  }

  const appEnv = resolveAppRuntimeEnv(env.APP_ENV);

  if (mode === "mock") {
    if (isProductionRuntimeEnvironment(appEnv)) {
      throw new Error(
        "LEGACYGATEWAY_REFUND_PROVIDER_MODE=mock is forbidden when APP_ENV=production",
      );
    }
    if (appEnv !== "development" && appEnv !== "staging") {
      throw new Error(
        `LEGACYGATEWAY_REFUND_PROVIDER_MODE=mock is only allowed in development|staging (got ${appEnv})`,
      );
    }
  }

  return mode;
}

export function assertLegacygatewayRefundProviderModeAllowed(
  env: NodeJS.ProcessEnv = process.env,
): LegacygatewayRefundProviderMode {
  return resolveLegacygatewayRefundProviderMode(env);
}

export function createRefundPaymentProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RefundPaymentProvider {
  const mode = resolveLegacygatewayRefundProviderMode(env);
  if (mode === "mock") {
    return new MockLegacygatewayPaymentProvider();
  }
  return LegacygatewayPaymentProvider.fromEnv();
}

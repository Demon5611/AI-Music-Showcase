import {
  isProductionRuntimeEnvironment,
  isShowcaseMode,
  resolveAppRuntimeEnv,
  type TbcRefundProviderMode,
} from "@ai-music/shared";
import { MockTbcPaymentProvider } from "./mock-tbc-payment-provider.js";
import { TbcPaymentProvider, type TbcRefundInput } from "./tbc-payment-provider.js";
import type { TbcPaymentDetails } from "./tbc-client.js";

/**
 * Shared surface for real TBC + staging/dev mock adapters.
 * Worker/API must not call api.tbcbank.ge when mode=mock.
 */
export type RefundPaymentProvider = {
  getPaymentDetails(providerPaymentId: string): Promise<TbcPaymentDetails>;
  refund(input: TbcRefundInput): Promise<{ providerReference: string | null }>;
};

export function resolveTbcRefundProviderMode(
  env: NodeJS.ProcessEnv = process.env,
): TbcRefundProviderMode {
  if (isShowcaseMode(env)) {
    return "mock";
  }

  const raw = (env.TBC_REFUND_PROVIDER_MODE ?? "real").trim().toLowerCase();
  const mode: TbcRefundProviderMode = raw === "mock" ? "mock" : raw === "real" ? "real" : "real";

  if (raw !== "real" && raw !== "mock" && raw.length > 0) {
    throw new Error(
      `Invalid TBC_REFUND_PROVIDER_MODE=${raw} (expected real|mock)`,
    );
  }

  const appEnv = resolveAppRuntimeEnv(env.APP_ENV);

  if (mode === "mock") {
    if (isProductionRuntimeEnvironment(appEnv)) {
      throw new Error(
        "TBC_REFUND_PROVIDER_MODE=mock is forbidden when APP_ENV=production",
      );
    }
    if (appEnv !== "development" && appEnv !== "staging") {
      throw new Error(
        `TBC_REFUND_PROVIDER_MODE=mock is only allowed in development|staging (got ${appEnv})`,
      );
    }
  }

  return mode;
}

export function assertTbcRefundProviderModeAllowed(
  env: NodeJS.ProcessEnv = process.env,
): TbcRefundProviderMode {
  return resolveTbcRefundProviderMode(env);
}

export function createRefundPaymentProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RefundPaymentProvider {
  const mode = resolveTbcRefundProviderMode(env);
  if (mode === "mock") {
    return new MockTbcPaymentProvider();
  }
  return TbcPaymentProvider.fromEnv();
}

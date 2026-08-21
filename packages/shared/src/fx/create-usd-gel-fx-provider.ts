import { UnconfiguredUsdGelFxProvider, type FxRateProvider } from "./fx-rate-provider.js";
import { NbgUsdGelFxProvider } from "./nbg-usd-gel.js";

export const USD_GEL_FX_PROVIDERS = ["nbg", "unconfigured"] as const;
export type UsdGelFxProviderId = (typeof USD_GEL_FX_PROVIDERS)[number];

export type UsdGelFxEnvBag = {
  FX_USD_GEL_PROVIDER?: string;
  APP_ENV?: string;
};

let nbgSingleton: NbgUsdGelFxProvider | undefined;

/**
 * Env-only selection. `static` / test providers are never chosen from env.
 * Unknown or missing → unconfigured (fail closed), including production.
 */
export function resolveUsdGelFxProviderId(env?: UsdGelFxEnvBag): UsdGelFxProviderId {
  const raw = env?.FX_USD_GEL_PROVIDER?.trim().toLowerCase();
  if (raw === "nbg") {
    return "nbg";
  }
  return "unconfigured";
}

export function createUsdGelFxProvider(env?: UsdGelFxEnvBag): FxRateProvider {
  if (resolveUsdGelFxProviderId(env) === "nbg") {
    nbgSingleton ??= new NbgUsdGelFxProvider();
    return nbgSingleton;
  }
  return new UnconfiguredUsdGelFxProvider();
}

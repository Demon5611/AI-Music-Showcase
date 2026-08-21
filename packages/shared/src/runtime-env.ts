/**
 * Runtime environment helpers shared by API / worker.
 * Prefer APP_ENV over NODE_ENV for security gates.
 */

export type AppRuntimeEnv = "development" | "staging" | "production";

/** Staging + production: ops routes and secrets must be fail-closed. */
export function isProtectedRuntimeEnvironment(
  appEnv: string | undefined | null,
): boolean {
  return appEnv === "staging" || appEnv === "production";
}

export function isProductionRuntimeEnvironment(
  appEnv: string | undefined | null,
): boolean {
  return appEnv === "production";
}

export function resolveAppRuntimeEnv(
  value: string | undefined | null,
): AppRuntimeEnv {
  if (value === "staging" || value === "production") {
    return value;
  }
  return "development";
}

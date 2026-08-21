import "../common/load-env.js";
import { createMurekaClient, isMurekaInvalidUrlFetchError, MurekaHttpError } from "@ai-music/ai-providers";
import { logLoadControl, resolveMurekaFeatureFlags } from "@ai-music/shared";
import { getWorkerEnv } from "../config/env.js";

/**
 * Staging/dev-only unpaid connectivity check: GET /v1/account/billing.
 * Refuses production. Does not create Vocal IDs or songs.
 */
async function main(): Promise<void> {
  const env = getWorkerEnv();
  if (env.APP_ENV === "production") {
    throw new Error("mureka connectivity probe is staging/dev only");
  }

  const flags = resolveMurekaFeatureFlags(process.env);
  logLoadControl("mureka_connectivity_probe", {
    step: "config",
    appEnv: env.APP_ENV,
    baseUrlConfigured: flags.baseUrlConfigured,
    baseUrlValid: flags.baseUrlValid,
    protocol: flags.baseUrlProtocol,
    hostname: flags.baseUrlHostname,
    hasApiKey: flags.apiKeyConfigured,
  });

  if (!flags.baseUrlValid) {
    throw new MurekaHttpError({
      message: "MUREKA_BASE_URL is not a valid absolute https:// URL",
      kind: "configuration",
      retryable: false,
      ambiguous: false,
    });
  }

  const started = Date.now();
  const billing = await createMurekaClient().getBilling();
  logLoadControl("mureka_connectivity_probe", {
    step: "billing",
    result: "ok",
    durationMs: Date.now() - started,
    // Never log balances or account identifiers that could be sensitive.
    hasBalanceField: billing !== null && typeof billing === "object",
  });
}

main()
  .then(() => {
    logLoadControl("mureka_connectivity_probe", { step: "done", result: "green" });
    process.exit(0);
  })
  .catch((error: unknown) => {
    const kind =
      error instanceof MurekaHttpError
        ? error.kind
        : isMurekaInvalidUrlFetchError(error)
          ? "configuration"
          : "unknown";
    logLoadControl(
      "mureka_connectivity_probe",
      {
        step: "failed",
        result: "red",
        errorKind: kind,
        retryable: error instanceof MurekaHttpError ? error.retryable : false,
        message: error instanceof Error ? error.message.slice(0, 200) : String(error),
      },
      "error",
    );
    process.exit(1);
  });

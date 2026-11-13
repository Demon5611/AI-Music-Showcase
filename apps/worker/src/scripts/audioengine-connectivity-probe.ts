import "../common/load-env.js";
import { createAudioengineClient, isAudioengineInvalidUrlFetchError, AudioengineHttpError } from "@ai-music/ai-providers";
import { logLoadControl, resolveAudioengineFeatureFlags } from "@ai-music/shared";
import { getWorkerEnv } from "../config/env.js";

/**
 * Staging/dev-only unpaid connectivity check: GET /v1/account/billing.
 * Refuses production. Does not create Vocal IDs or songs.
 */
async function main(): Promise<void> {
  const env = getWorkerEnv();
  if (env.APP_ENV === "production") {
    throw new Error("audioengine connectivity probe is staging/dev only");
  }

  const flags = resolveAudioengineFeatureFlags(process.env);
  logLoadControl("audioengine_connectivity_probe", {
    step: "config",
    appEnv: env.APP_ENV,
    baseUrlConfigured: flags.baseUrlConfigured,
    baseUrlValid: flags.baseUrlValid,
    protocol: flags.baseUrlProtocol,
    hostname: flags.baseUrlHostname,
    hasApiKey: flags.apiKeyConfigured,
  });

  if (!flags.baseUrlValid) {
    throw new AudioengineHttpError({
      message: "AUDIOENGINE_BASE_URL is not a valid absolute https:// URL",
      kind: "configuration",
      retryable: false,
      ambiguous: false,
    });
  }

  const started = Date.now();
  const billing = await createAudioengineClient().getBilling();
  logLoadControl("audioengine_connectivity_probe", {
    step: "billing",
    result: "ok",
    durationMs: Date.now() - started,
    // Never log balances or account identifiers that could be sensitive.
    hasBalanceField: billing !== null && typeof billing === "object",
  });
}

main()
  .then(() => {
    logLoadControl("audioengine_connectivity_probe", { step: "done", result: "green" });
    process.exit(0);
  })
  .catch((error: unknown) => {
    const kind =
      error instanceof AudioengineHttpError
        ? error.kind
        : isAudioengineInvalidUrlFetchError(error)
          ? "configuration"
          : "unknown";
    logLoadControl(
      "audioengine_connectivity_probe",
      {
        step: "failed",
        result: "red",
        errorKind: kind,
        retryable: error instanceof AudioengineHttpError ? error.retryable : false,
        message: error instanceof Error ? error.message.slice(0, 200) : String(error),
      },
      "error",
    );
    process.exit(1);
  });

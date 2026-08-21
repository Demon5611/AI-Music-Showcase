import {
  parseMurekaBaseUrl,
  isMurekaWorkerListenReady,
  resolveMurekaFeatureFlags,
  type MurekaFeatureFlags,
} from "@ai-music/shared";

export interface MurekaClientConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  songCount: number;
  requestTimeoutMs: number;
  pollTimeoutMs: number;
  flags: MurekaFeatureFlags;
}

export class MurekaConfigurationError extends Error {
  readonly code = "MUREKA_CONFIG_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "MurekaConfigurationError";
  }
}

export function resolveMurekaClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): MurekaClientConfig {
  const flags = resolveMurekaFeatureFlags(env);
  const timeoutMs = Number(env.MUREKA_REQUEST_TIMEOUT_MS ?? 30_000);
  const pollTimeoutMs = Number(env.MUREKA_TASK_TIMEOUT_MS ?? 600_000);
  const parsed = parseMurekaBaseUrl(env.MUREKA_BASE_URL);

  if (!parsed.ok) {
    throw new MurekaConfigurationError(
      `Invalid MUREKA_BASE_URL (${parsed.reason}): must be an absolute https:// URL`,
    );
  }

  return {
    apiKey: env.MUREKA_API_KEY?.trim() ?? "",
    baseUrl: parsed.baseUrl,
    model: flags.model,
    songCount: flags.songCount,
    requestTimeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30_000,
    pollTimeoutMs:
      Number.isFinite(pollTimeoutMs) && pollTimeoutMs > 0 ? pollTimeoutMs : 600_000,
    flags: {
      ...flags,
      baseUrl: parsed.baseUrl,
      baseUrlValid: true,
      baseUrlProtocol: parsed.protocol,
      baseUrlHostname: parsed.hostname,
    },
  };
}

export function assertMurekaEnabled(config: MurekaClientConfig): void {
  if (!config.flags.enabled) {
    throw new MurekaConfigurationError("Mureka is disabled (MUREKA_ENABLED=false)");
  }

  if (!config.apiKey) {
    throw new MurekaConfigurationError(
      "MUREKA_API_KEY is required when Mureka is enabled",
    );
  }

  if (!config.flags.baseUrlValid || !config.baseUrl) {
    throw new MurekaConfigurationError(
      "MUREKA_BASE_URL must be an absolute https:// URL",
    );
  }
}

/** True when staging/dev/production-rollout may start the Mureka queue listener. */
export function canListenMurekaProviderJobs(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isMurekaWorkerListenReady(env.APP_ENV, env);
}

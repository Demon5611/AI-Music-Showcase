import {
  parseAudioengineBaseUrl,
  isAudioengineWorkerListenReady,
  resolveAudioengineFeatureFlags,
  type AudioengineFeatureFlags,
} from "@ai-music/shared";

export interface AudioengineClientConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  songCount: number;
  requestTimeoutMs: number;
  pollTimeoutMs: number;
  flags: AudioengineFeatureFlags;
}

export class AudioengineConfigurationError extends Error {
  readonly code = "AUDIOENGINE_CONFIG_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "AudioengineConfigurationError";
  }
}

export function resolveAudioengineClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): AudioengineClientConfig {
  const flags = resolveAudioengineFeatureFlags(env);
  const timeoutMs = Number(env.AUDIOENGINE_REQUEST_TIMEOUT_MS ?? 30_000);
  const pollTimeoutMs = Number(env.AUDIOENGINE_TASK_TIMEOUT_MS ?? 600_000);
  const parsed = parseAudioengineBaseUrl(env.AUDIOENGINE_BASE_URL);

  if (!parsed.ok) {
    throw new AudioengineConfigurationError(
      `Invalid AUDIOENGINE_BASE_URL (${parsed.reason}): must be an absolute https:// URL`,
    );
  }

  return {
    apiKey: env.AUDIOENGINE_API_KEY?.trim() ?? "",
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

export function assertAudioengineEnabled(config: AudioengineClientConfig): void {
  if (!config.flags.enabled) {
    throw new AudioengineConfigurationError("Audioengine is disabled (AUDIOENGINE_ENABLED=false)");
  }

  if (!config.apiKey) {
    throw new AudioengineConfigurationError(
      "AUDIOENGINE_API_KEY is required when Audioengine is enabled",
    );
  }

  if (!config.flags.baseUrlValid || !config.baseUrl) {
    throw new AudioengineConfigurationError(
      "AUDIOENGINE_BASE_URL must be an absolute https:// URL",
    );
  }
}

/** True when staging/dev/production-rollout may start the Audioengine queue listener. */
export function canListenAudioengineProviderJobs(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isAudioengineWorkerListenReady(env.APP_ENV, env);
}

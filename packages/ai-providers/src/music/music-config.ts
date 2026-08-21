import type { MusicProviderId } from "./domain/music-provider-id.js";
import { resolveMusicProviderId } from "./domain/music-provider-id.js";

const OFFICIAL_SUNO_API_HOST = "api.sunoapi.org";

export interface MusicProviderConfig {
  providerId: MusicProviderId;
  /**
   * Required by Suno async API. Webhook at SUNO_CALLBACK_URL syncs status; polling is fallback.
   */
  sunoCallbackUrl: string;
  /** Music generate/submit/poll only — never used by Suno Voice clients. */
  sunoApiBaseUrl: string;
  sunoApiKey: string;
  sunoModel: string;
  /** Model for Suno Voice persona (voice_persona requires V5 or V5_5). */
  sunoVoiceModel: string;
  requestTimeoutMs: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

function resolveSunoMusicApiBaseUrl(env: NodeJS.ProcessEnv): string {
  return (
    env.SUNO_MUSIC_API_BASE_URL?.trim() ||
    env.SUNO_API_BASE_URL?.trim() ||
    `https://${OFFICIAL_SUNO_API_HOST}`
  );
}

/**
 * Production must not point music generate at a non-official host (e.g. load-test fake).
 * Voice continues to use SUNO_API_BASE_URL via resolveSunoVoiceConfig.
 */
export function assertSafeSunoMusicApiBaseUrl(
  baseUrl: string,
  appEnv: string | undefined = process.env.APP_ENV,
): void {
  if (appEnv !== "production") {
    return;
  }

  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    throw new Error(`Invalid SUNO_MUSIC_API_BASE_URL / SUNO_API_BASE_URL: ${baseUrl}`);
  }

  if (hostname !== OFFICIAL_SUNO_API_HOST) {
    throw new Error(
      `Production music API base URL host must be ${OFFICIAL_SUNO_API_HOST}, got ${hostname}`,
    );
  }
}

export function resolveMusicProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): MusicProviderConfig {
  const sunoApiBaseUrl = resolveSunoMusicApiBaseUrl(env);
  assertSafeSunoMusicApiBaseUrl(sunoApiBaseUrl, env.APP_ENV);

  return {
    providerId: resolveMusicProviderId(env),
    sunoCallbackUrl:
      env.SUNO_CALLBACK_URL ??
      "http://localhost:3001/api/music/callback/suno",
    sunoApiBaseUrl,
    sunoApiKey: env.SUNO_API_KEY ?? "",
    sunoModel: env.SUNO_API_MODEL ?? "V4_5ALL",
    sunoVoiceModel: env.SUNO_VOICE_MODEL ?? "V5",
    requestTimeoutMs: Number(env.SUNO_REQUEST_TIMEOUT_MS ?? 30_000),
    pollIntervalMs: Number(env.SUNO_POLL_INTERVAL_MS ?? 5_000),
    pollTimeoutMs: Number(env.SUNO_POLL_TIMEOUT_MS ?? 600_000),
  };
}

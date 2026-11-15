import type { MusicProviderId } from "./domain/music-provider-id.js";
import { resolveMusicProviderId } from "./domain/music-provider-id.js";

const OFFICIAL_LEGACYENGINE_API_HOST = "integration.example.invalid";

export interface MusicProviderConfig {
  providerId: MusicProviderId;
  /**
   * Required by Legacyengine async API. Webhook at LEGACYENGINE_CALLBACK_URL syncs status; polling is fallback.
   */
  legacyengineCallbackUrl: string;
  /** Music generate/submit/poll only — never used by Legacyengine Voice clients. */
  legacyengineApiBaseUrl: string;
  legacyengineApiKey: string;
  legacyengineModel: string;
  /** Model for Legacyengine Voice persona (voice_persona requires V5 or V5_5). */
  legacyengineVoiceModel: string;
  requestTimeoutMs: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

function resolveLegacyengineMusicApiBaseUrl(env: NodeJS.ProcessEnv): string {
  return (
    env.LEGACYENGINE_MUSIC_API_BASE_URL?.trim() ||
    env.LEGACYENGINE_API_BASE_URL?.trim() ||
    `https://${OFFICIAL_LEGACYENGINE_API_HOST}`
  );
}

/**
 * Production must not point music generate at a non-official host (e.g. load-test fake).
 * Voice continues to use LEGACYENGINE_API_BASE_URL via resolveLegacyengineVoiceConfig.
 */
export function assertSafeLegacyengineMusicApiBaseUrl(
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
    throw new Error(`Invalid LEGACYENGINE_MUSIC_API_BASE_URL / LEGACYENGINE_API_BASE_URL: ${baseUrl}`);
  }

  if (hostname !== OFFICIAL_LEGACYENGINE_API_HOST) {
    throw new Error(
      `Production music API base URL host must be ${OFFICIAL_LEGACYENGINE_API_HOST}, got ${hostname}`,
    );
  }
}

export function resolveMusicProviderConfig(
  env: NodeJS.ProcessEnv = process.env,
): MusicProviderConfig {
  const legacyengineApiBaseUrl = resolveLegacyengineMusicApiBaseUrl(env);
  assertSafeLegacyengineMusicApiBaseUrl(legacyengineApiBaseUrl, env.APP_ENV);

  return {
    providerId: resolveMusicProviderId(env),
    legacyengineCallbackUrl:
      env.LEGACYENGINE_CALLBACK_URL ??
      "http://localhost:3001/api/music/callback/legacyengine",
    legacyengineApiBaseUrl,
    legacyengineApiKey: env.LEGACYENGINE_API_KEY ?? "",
    legacyengineModel: env.LEGACYENGINE_API_MODEL ?? "V4_5ALL",
    legacyengineVoiceModel: env.LEGACYENGINE_VOICE_MODEL ?? "V5",
    requestTimeoutMs: Number(env.LEGACYENGINE_REQUEST_TIMEOUT_MS ?? 30_000),
    pollIntervalMs: Number(env.LEGACYENGINE_POLL_INTERVAL_MS ?? 5_000),
    pollTimeoutMs: Number(env.LEGACYENGINE_POLL_TIMEOUT_MS ?? 600_000),
  };
}

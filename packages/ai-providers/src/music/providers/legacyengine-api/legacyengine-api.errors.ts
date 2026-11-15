import { MusicGenerationFailedError } from "../../domain/errors/music-generation-failed.error.js";
import { MusicInsufficientCreditsError } from "../../domain/errors/music-insufficient-credits.error.js";
import { MusicInvalidPromptError } from "../../domain/errors/music-invalid-prompt.error.js";
import { MusicProviderError } from "../../domain/errors/music-provider.error.js";
import { MusicProviderUnavailableError } from "../../domain/errors/music-provider-unavailable.error.js";
import { MusicRateLimitError } from "../../domain/errors/music-rate-limit.error.js";
import { MusicTimeoutError } from "../../domain/errors/music-timeout.error.js";
import type { LegacyengineApiEnvelope } from "./legacyengine-api.types.js";

const PROVIDER_ID = "legacyengineapi" as const;

export function assertLegacyengineApiKey(apiKey: string): void {
  if (!apiKey.trim()) {
    throw new MusicProviderError(
      "LEGACYENGINE_API_KEY is required",
      "LEGACYENGINE_API_KEY_MISSING",
      PROVIDER_ID,
      500,
    );
  }
}

export function mapLegacyengineApiCodeToError(
  code: number,
  message: string,
  cause?: unknown,
): MusicProviderError {
  switch (code) {
    case 429:
      return new MusicInsufficientCreditsError(PROVIDER_ID, message);
    case 405:
    case 430:
      return new MusicRateLimitError(PROVIDER_ID, message);
    case 400:
    case 413:
      return new MusicInvalidPromptError(PROVIDER_ID, message);
    case 401:
      return new MusicProviderError(message, "LEGACYENGINE_UNAUTHORIZED", PROVIDER_ID, 401);
    case 500:
    case 455:
      return new MusicProviderUnavailableError(PROVIDER_ID, message, cause);
    default:
      return new MusicProviderError(message, "LEGACYENGINE_API_ERROR", PROVIDER_ID, 502, cause);
  }
}

export function mapLegacyengineMusicTaskStatusToError(
  status: string,
  errorMessage?: string | null,
): MusicProviderError | null {
  if (status === "SUCCESS") {
    return null;
  }

  if (
    status === "PENDING" ||
    status === "TEXT_SUCCESS" ||
    status === "FIRST_SUCCESS" ||
    status === "GENERATING"
  ) {
    return null;
  }

  const message = errorMessage ?? `Legacyengine music task failed: ${status}`;

  if (status === "SENSITIVE_WORD_ERROR") {
    return new MusicInvalidPromptError(PROVIDER_ID, message);
  }

  if (status === "CREATE_TASK_FAILED") {
    return new MusicGenerationFailedError(
      PROVIDER_ID,
      errorMessage ??
        "AI Music не принял задачу. Проверьте образец голоса или попробуйте снова.",
    );
  }

  return new MusicGenerationFailedError(PROVIDER_ID, message);
}

export function mapLegacyengineLyricsTaskStatusToError(
  status: string,
  errorMessage?: string | null,
): MusicProviderError | null {
  if (status === "SUCCESS" || status === "PENDING") {
    return null;
  }

  const message = errorMessage ?? `Legacyengine lyrics task failed: ${status}`;

  if (status === "SENSITIVE_WORD_ERROR") {
    return new MusicInvalidPromptError(PROVIDER_ID, message);
  }

  return new MusicGenerationFailedError(PROVIDER_ID, message);
}

export function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "AbortError" || /fetch failed|connect timeout|econnreset/i.test(error.message);
}

export function toMusicTimeoutError(): MusicTimeoutError {
  return new MusicTimeoutError(PROVIDER_ID);
}

export async function parseLegacyengineEnvelope<T>(
  response: Response,
): Promise<LegacyengineApiEnvelope<T>> {
  const rawBody = await response.text();
  let parsed: LegacyengineApiEnvelope<T>;

  try {
    parsed = JSON.parse(rawBody) as LegacyengineApiEnvelope<T>;
  } catch {
    throw new MusicProviderUnavailableError(
      PROVIDER_ID,
      `Legacyengine API returned non-JSON response: HTTP ${response.status}`,
    );
  }

  if (parsed.code !== 200) {
    throw mapLegacyengineApiCodeToError(parsed.code, parsed.msg || "Legacyengine API error");
  }

  return parsed;
}

import type { SubmitGenerationResult } from "../../domain/music-generation-provider.js";
import { logLoadControl } from "@ai-music/shared";
import { MusicProviderUnavailableError } from "../../domain/errors/music-provider-unavailable.error.js";
import { MusicTimeoutError } from "../../domain/errors/music-timeout.error.js";
import {
  isRetryableNetworkError,
  mapLegacyengineApiCodeToError,
  toMusicTimeoutError,
} from "./legacyengine-api.errors.js";
import type { LegacyengineApiEnvelope, LegacyengineTaskIdData } from "./legacyengine-api.types.js";

const API_PREFIX = "/api/v1";

/**
 * @deprecated Prefer SubmitGenerationResult — kept as alias for existing imports.
 */
export type LegacyengineMusicSubmitOnceResult = SubmitGenerationResult;

const TERMINAL_CODES = new Set([400, 401, 404, 413, 429]);
const CAPACITY_CODES = new Set([405, 430, 455]);

export async function submitLegacyengineMusicTaskOnce(input: {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  path: "/generate" | "/generate/upload-cover";
  body: unknown;
}): Promise<SubmitGenerationResult> {
  const submitStartedAt = Date.now();
  const url = `${input.baseUrl.replace(/\/$/, "")}${API_PREFIX}${input.path}`;

  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input.body),
    }, input.timeoutMs);

    const rawBody = await response.text();
    let parsed: LegacyengineApiEnvelope<LegacyengineTaskIdData>;

    try {
      parsed = JSON.parse(rawBody) as LegacyengineApiEnvelope<LegacyengineTaskIdData>;
    } catch {
      return {
        kind: "ambiguous",
        code: response.status,
        message: `Legacyengine API returned non-JSON / truncated response: HTTP ${response.status}`,
      };
    }

    const taskId = parsed.data?.taskId?.trim();
    const code = typeof parsed.code === "number" ? parsed.code : response.status;

    if (code === 200 && taskId) {
      logLoadControl("legacyengine_submit", {
        path: input.path,
        taskId,
        durationMs: Date.now() - submitStartedAt,
        once: true,
      });
      return { kind: "ok", taskId };
    }

    if (code === 200 && !taskId) {
      return {
        kind: "ambiguous",
        code: 200,
        message: "Legacyengine API returned 200 without a valid taskId",
      };
    }

    if (TERMINAL_CODES.has(code)) {
      return {
        kind: "failed_terminal",
        code,
        message: parsed.msg || mapLegacyengineApiCodeToError(code, "Legacyengine API error").message,
      };
    }

    if (CAPACITY_CODES.has(code) && !taskId) {
      return {
        kind: "retryable_capacity",
        code,
        message: parsed.msg || `Legacyengine capacity code ${code}`,
      };
    }

    if (code >= 500 || code === 500) {
      return {
        kind: "ambiguous",
        code,
        message: parsed.msg || `Legacyengine vendor error ${code}`,
      };
    }

    // Unknown vendor code with or without taskId: treat as ambiguous if we
    // cannot prove rejection without side effects.
    if (taskId) {
      logLoadControl("legacyengine_submit", {
        path: input.path,
        taskId,
        durationMs: Date.now() - submitStartedAt,
        once: true,
        unusualCode: code,
      });
      return { kind: "ok", taskId };
    }

    return {
      kind: "ambiguous",
      code,
      message: parsed.msg || `Unexpected Legacyengine code ${code}`,
    };
  } catch (error) {
    if (error instanceof MusicTimeoutError) {
      return { kind: "ambiguous", message: error.message };
    }

    if (isRetryableNetworkError(error)) {
      return {
        kind: "ambiguous",
        message: error instanceof Error ? error.message : "network error",
      };
    }

    if (error instanceof MusicProviderUnavailableError) {
      return { kind: "ambiguous", message: error.message };
    }

    return {
      kind: "ambiguous",
      message: error instanceof Error ? error.message : "unknown submit error",
    };
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw toMusicTimeoutError();
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

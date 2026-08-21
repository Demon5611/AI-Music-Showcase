import { logLoadControl } from "@ai-music/shared";
import { MusicProviderUnavailableError } from "../../domain/errors/music-provider-unavailable.error.js";
import { MusicRateLimitError } from "../../domain/errors/music-rate-limit.error.js";
import {
  assertSunoApiKey,
  isRetryableNetworkError,
  mapSunoApiCodeToError,
  parseSunoEnvelope,
  toMusicTimeoutError,
} from "./suno-api.errors.js";
import { getSunoRateLimiter } from "./suno-rate-limiter.js";
import type {
  SunoApiEnvelope,
  SunoAlbumCoverGenerateRequest,
  SunoAlbumCoverTaskRaw,
  SunoExtendMusicRequest,
  SunoGenerateLyricsRequest,
  SunoGenerateMusicRequest,
  SunoLyricsTaskRaw,
  SunoModelId,
  SunoMusicTaskRaw,
  SunoTaskIdData,
  SunoTimestampedLyricsDataRaw,
  SunoTimestampedLyricsRequest,
  SunoUploadCoverRequest,
  SunoVocalRemovalRequest,
  SunoVocalRemovalTaskRaw,
} from "./suno-api.types.js";

const API_PREFIX = "/api/v1";
const DEFAULT_RETRIES = 2;
const RATE_LIMIT_RETRIES = 4;

export interface SunoApiClientConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  retries?: number;
  rateLimitRetries?: number;
}

export class SunoApiClient {
  private readonly retries: number;
  private readonly rateLimitRetries: number;

  constructor(private readonly config: SunoApiClientConfig) {
    assertSunoApiKey(config.apiKey);
    this.retries = config.retries ?? DEFAULT_RETRIES;
    this.rateLimitRetries = config.rateLimitRetries ?? RATE_LIMIT_RETRIES;
  }

  generateMusic(body: SunoGenerateMusicRequest): Promise<string> {
    return this.createTask("/generate", body);
  }

  generateLyrics(body: SunoGenerateLyricsRequest): Promise<string> {
    return this.createTask("/lyrics", body);
  }

  uploadAndCover(body: SunoUploadCoverRequest): Promise<string> {
    return this.createTask("/generate/upload-cover", body);
  }

  extendMusic(body: SunoExtendMusicRequest): Promise<string> {
    return this.createTask("/generate/extend", body);
  }

  getTimestampedLyrics(body: SunoTimestampedLyricsRequest): Promise<SunoTimestampedLyricsDataRaw> {
    return this.postImmediate("/generate/get-timestamped-lyrics", body);
  }

  separateVocals(body: SunoVocalRemovalRequest): Promise<string> {
    return this.createTask("/vocal-removal/generate", body);
  }

  getVocalRemovalDetails(taskId: string): Promise<SunoVocalRemovalTaskRaw> {
    return this.fetchTask(`/vocal-removal/record-info?taskId=${encodeURIComponent(taskId)}`);
  }

  getMusicGenerationDetails(taskId: string): Promise<SunoMusicTaskRaw> {
    return this.fetchTask(`/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
  }

  getLyricsGenerationDetails(taskId: string): Promise<SunoLyricsTaskRaw> {
    return this.fetchTask(`/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`);
  }

  generateAlbumCover(body: SunoAlbumCoverGenerateRequest): Promise<string> {
    return this.submitCoverGenerate(body);
  }

  getAlbumCoverDetails(taskId: string): Promise<SunoAlbumCoverTaskRaw | null> {
    return this.fetchTask(`/suno/cover/record-info?taskId=${encodeURIComponent(taskId)}`);
  }

  getRemainingCredits(): Promise<number> {
    return this.request<number>("/get-credits", { method: "GET" });
  }

  private async createTask(path: string, body: unknown): Promise<string> {
    const submitStartedAt = Date.now();
    await getSunoRateLimiter().acquire();

    const data = await this.request<SunoTaskIdData>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!data.taskId) {
      throw mapSunoApiCodeToError(500, "Suno API did not return taskId");
    }

    logLoadControl("suno_submit", {
      path,
      taskId: data.taskId,
      durationMs: Date.now() - submitStartedAt,
    });

    return data.taskId;
  }

  private async submitCoverGenerate(body: SunoAlbumCoverGenerateRequest): Promise<string> {
    const path = "/suno/cover/generate";
    const submitStartedAt = Date.now();
    await getSunoRateLimiter().acquire();

    const url = `${this.config.baseUrl.replace(/\/$/, "")}${API_PREFIX}${path}`;
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      body: JSON.stringify(body),
    });

    const rawBody = await response.text();
    let parsed: SunoApiEnvelope<SunoTaskIdData>;

    try {
      parsed = JSON.parse(rawBody) as SunoApiEnvelope<SunoTaskIdData>;
    } catch {
      throw new MusicProviderUnavailableError(
        "sunoapi",
        `Suno API returned non-JSON response: HTTP ${response.status}`,
      );
    }

    const taskId = parsed.data?.taskId?.trim();
    const isDuplicateCover =
      parsed.code === 400 || parsed.code === 409;

    if (taskId && (parsed.code === 200 || isDuplicateCover)) {
      logLoadControl("suno_submit", {
        path,
        taskId,
        durationMs: Date.now() - submitStartedAt,
        duplicateCover: isDuplicateCover,
      });

      return taskId;
    }

    throw mapSunoApiCodeToError(parsed.code, parsed.msg || "Suno API error");
  }

  private async postImmediate<T>(path: string, body: unknown): Promise<T> {
    await getSunoRateLimiter().acquire();

    return this.request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  private async fetchTask<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, "")}${API_PREFIX}${path}`;
    const maxAttempts = init.method === "POST" ? this.rateLimitRetries : this.retries;

    for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(url, init);
        const envelope = await parseSunoEnvelope<T>(response);
        return envelope.data;
      } catch (error) {
        if (!this.shouldRetry(error, attempt, maxAttempts)) {
          throw error;
        }

        if (error instanceof MusicRateLimitError) {
          logLoadControl(
            "suno_rate_limit_retry",
            {
              path,
              attempt: attempt + 1,
              maxAttempts: maxAttempts + 1,
            },
            "warn",
          );
        }

        await sleep(resolveRetryDelayMs(error, attempt));
      }
    }

    throw toMusicTimeoutError();
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });

      if (!response.ok && response.status >= 500) {
        const body = await response.text();
        let code = response.status;

        try {
          const parsed = JSON.parse(body) as SunoApiEnvelope<unknown>;
          code = parsed.code ?? response.status;
        } catch {
          // Non-JSON 5xx body.
        }

        throw mapSunoApiCodeToError(code, `Suno API HTTP ${response.status}`);
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw toMusicTimeoutError();
      }

      if (isRetryableNetworkError(error)) {
        throw error;
      }

      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private shouldRetry(error: unknown, attempt: number, maxAttempts: number): boolean {
    if (attempt >= maxAttempts) {
      return false;
    }

    if (error instanceof MusicRateLimitError) {
      return true;
    }

    if (isRetryableNetworkError(error)) {
      return true;
    }

    if (error instanceof MusicProviderUnavailableError) {
      return true;
    }

    return false;
  }
}

function resolveRetryDelayMs(error: unknown, attempt: number): number {
  const baseMs = error instanceof MusicRateLimitError ? 2_000 : 500;
  const exponential = baseMs * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 400);
  return Math.min(exponential + jitter, 15_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function toSunoModelId(model: string): SunoModelId {
  const allowed: SunoModelId[] = ["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5", "V5_5"];

  if ((allowed as readonly string[]).includes(model)) {
    return model as SunoModelId;
  }

  return "V4_5ALL";
}

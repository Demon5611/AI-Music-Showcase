import { z } from "zod";
import {
  assertNoSecretInText,
  classifyMurekaHttpStatus,
  isMurekaInvalidUrlFetchError,
  MurekaHttpError,
} from "./mureka-errors.js";
import {
  assertMurekaEnabled,
  resolveMurekaClientConfig,
  type MurekaClientConfig,
} from "./mureka-config.js";
import { parseMurekaBaseUrl } from "@ai-music/shared";
import {
  murekaBillingResponseSchema,
  murekaGenerateSongRequestSchema,
  murekaGenerateSongResponseSchema,
  murekaQuerySongResponseSchema,
  murekaVocalCloneResponseSchema,
  resolveMurekaTaskId,
  type MurekaBillingResponse,
  type MurekaGenerateSongRequest,
  type MurekaGenerateSongResponse,
  type MurekaQuerySongResponse,
  type MurekaVocalCloneResponse,
} from "./mureka-types.js";

export interface MurekaVocalCloneInput {
  /** MP3 bytes ready for provider boundary. */
  file: Buffer;
  filename?: string;
  contentType?: string;
  description?: string;
}

export class MurekaClient {
  constructor(private readonly config: MurekaClientConfig = resolveMurekaClientConfig()) {}

  getConfig(): MurekaClientConfig {
    return this.config;
  }

  async createVocalClone(input: MurekaVocalCloneInput): Promise<MurekaVocalCloneResponse> {
    assertMurekaEnabled(this.config);

    const form = new FormData();
    const bytes = new Uint8Array(input.file);
    const blob = new Blob([bytes], {
      type: input.contentType ?? "audio/mpeg",
    });
    form.append("file", blob, input.filename ?? "voice.mp3");
    if (input.description?.trim()) {
      form.append("description", input.description.trim());
    }

    return this.request({
      method: "POST",
      path: "/v1/song/vocal-clone",
      body: form,
      schema: murekaVocalCloneResponseSchema,
    });
  }

  async generateSong(input: MurekaGenerateSongRequest): Promise<{
    taskId: string;
    raw: MurekaGenerateSongResponse;
  }> {
    assertMurekaEnabled(this.config);
    const body = murekaGenerateSongRequestSchema.parse(input);

    const raw = await this.request({
      method: "POST",
      path: "/v1/song/generate",
      json: body,
      schema: murekaGenerateSongResponseSchema,
    });

    const taskId = resolveMurekaTaskId(raw);
    if (!taskId) {
      throw new MurekaHttpError({
        message: "Mureka generate response missing task id",
        kind: "unknown",
        retryable: false,
        ambiguous: true,
      });
    }

    return { taskId, raw };
  }

  async querySong(taskId: string): Promise<MurekaQuerySongResponse> {
    assertMurekaEnabled(this.config);
    const encoded = encodeURIComponent(taskId);

    return this.request({
      method: "GET",
      path: `/v1/song/query/${encoded}`,
      schema: murekaQuerySongResponseSchema,
    });
  }

  async getBilling(): Promise<MurekaBillingResponse> {
    assertMurekaEnabled(this.config);

    return this.request({
      method: "GET",
      path: "/v1/account/billing",
      schema: murekaBillingResponseSchema,
    });
  }

  private async request<T>(input: {
    method: "GET" | "POST";
    path: string;
    json?: unknown;
    body?: FormData;
    schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  }): Promise<T> {
    const baseParsed = parseMurekaBaseUrl(this.config.baseUrl);
    if (!baseParsed.ok) {
      throw new MurekaHttpError({
        message: `Invalid Mureka base URL (${baseParsed.reason})`,
        kind: "configuration",
        retryable: false,
        ambiguous: false,
      });
    }

    const url = `${baseParsed.baseUrl}${input.path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
    };

    let body: string | FormData | Blob | undefined;
    if (input.body) {
      body = input.body;
    } else if (input.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(input.json);
    }

    try {
      const response = await fetch(url, {
        method: input.method,
        headers,
        body,
        signal: controller.signal,
      });

      const providerRequestId =
        response.headers.get("x-request-id") ??
        response.headers.get("x-mureka-request-id") ??
        undefined;

      const text = await response.text();
      assertNoSecretInText(text, this.config.apiKey);

      if (!response.ok) {
        const classified = classifyMurekaHttpStatus(response.status);
        let message = `Mureka HTTP ${response.status}`;
        try {
          const parsed = JSON.parse(text) as { message?: unknown; error?: unknown };
          const stringifyVendorField = (value: unknown): string | null => {
            if (typeof value === "string") {
              return value;
            }
            if (value == null) {
              return null;
            }
            try {
              return JSON.stringify(value);
            } catch {
              return String(value);
            }
          };
          const fromMessage = stringifyVendorField(parsed.message);
          const fromError = stringifyVendorField(parsed.error);
          message = fromMessage ?? fromError ?? message;
        } catch {
          // keep default message — do not attach full body
        }

        assertNoSecretInText(message, this.config.apiKey);

        throw new MurekaHttpError({
          message,
          kind: classified.kind,
          httpStatus: response.status,
          retryable: classified.retryable,
          ambiguous: classified.ambiguous && input.method === "POST",
          providerRequestId,
        });
      }

      let json: unknown = {};
      if (text.trim()) {
        try {
          json = JSON.parse(text);
        } catch (cause) {
          throw new MurekaHttpError({
            message: "Mureka response is not valid JSON",
            kind: "unknown",
            httpStatus: response.status,
            providerRequestId,
            cause,
          });
        }
      }

      const parsed = input.schema.safeParse(json);
      if (!parsed.success) {
        throw new MurekaHttpError({
          message: "Mureka response failed schema validation",
          kind: "unknown",
          httpStatus: response.status,
          providerRequestId,
        });
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof MurekaHttpError) {
        throw error;
      }

      if (isMurekaInvalidUrlFetchError(error)) {
        throw new MurekaHttpError({
          message: "Mureka base URL has an invalid scheme or is not absolute",
          kind: "configuration",
          retryable: false,
          ambiguous: false,
          cause: error,
        });
      }

      const aborted =
        (error instanceof Error && error.name === "AbortError") ||
        (typeof error === "object" &&
          error !== null &&
          "name" in error &&
          (error as { name: string }).name === "AbortError");

      throw new MurekaHttpError({
        message: aborted ? "Mureka request timeout" : "Mureka network error",
        kind: aborted ? "timeout" : "network",
        retryable: true,
        ambiguous: input.method === "POST",
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createMurekaClient(config?: MurekaClientConfig): MurekaClient {
  return new MurekaClient(config ?? resolveMurekaClientConfig());
}

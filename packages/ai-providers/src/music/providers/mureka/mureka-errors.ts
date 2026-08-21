import { MusicGenerationFailedError } from "../../domain/errors/music-generation-failed.error.js";
import { MusicInsufficientCreditsError } from "../../domain/errors/music-insufficient-credits.error.js";
import { MusicInvalidPromptError } from "../../domain/errors/music-invalid-prompt.error.js";
import { MusicProviderError } from "../../domain/errors/music-provider.error.js";
import { MusicProviderUnavailableError } from "../../domain/errors/music-provider-unavailable.error.js";
import { MusicRateLimitError } from "../../domain/errors/music-rate-limit.error.js";
import { MusicTimeoutError } from "../../domain/errors/music-timeout.error.js";
import { MUREKA_PROVIDER_ID, type MurekaErrorKind } from "./mureka-types.js";

export class MurekaHttpError extends Error {
  readonly provider = MUREKA_PROVIDER_ID;
  readonly kind: MurekaErrorKind;
  readonly httpStatus?: number;
  readonly retryable: boolean;
  readonly ambiguous: boolean;
  readonly providerRequestId?: string;

  constructor(input: {
    message: string;
    kind: MurekaErrorKind;
    httpStatus?: number;
    retryable?: boolean;
    ambiguous?: boolean;
    providerRequestId?: string;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "MurekaHttpError";
    this.kind = input.kind;
    this.httpStatus = input.httpStatus;
    this.retryable = input.retryable ?? false;
    this.ambiguous = input.ambiguous ?? false;
    this.providerRequestId = input.providerRequestId;
  }

  /** Safe log/error context — never includes API key or Authorization. */
  toLogContext(): Record<string, unknown> {
    return {
      provider: this.provider,
      kind: this.kind,
      httpStatus: this.httpStatus ?? null,
      retryable: this.retryable,
      ambiguous: this.ambiguous,
      providerRequestId: this.providerRequestId ?? null,
      message: this.message,
    };
  }
}

export function isMurekaInvalidUrlFetchError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code =
    "code" in error && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return (
    code === "ERR_INVALID_URL" ||
    code === "ERR_INVALID_URL_SCHEME" ||
    normalized.includes("unknown scheme") ||
    normalized.includes("invalid url") ||
    normalized.includes("invalid scheme")
  );
}

export function classifyMurekaHttpStatus(status: number): {
  kind: MurekaErrorKind;
  retryable: boolean;
  ambiguous: boolean;
} {
  if (status === 400) {
    return { kind: "validation", retryable: false, ambiguous: false };
  }
  if (status === 401) {
    return { kind: "authentication", retryable: false, ambiguous: false };
  }
  if (status === 402) {
    return { kind: "insufficient_balance", retryable: false, ambiguous: false };
  }
  if (status === 403) {
    return { kind: "permission", retryable: false, ambiguous: false };
  }
  if (status === 429) {
    return { kind: "rate_limit", retryable: true, ambiguous: false };
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return { kind: "server", retryable: true, ambiguous: true };
  }
  if (status >= 400 && status < 500) {
    return { kind: "validation", retryable: false, ambiguous: false };
  }
  if (status >= 500) {
    return { kind: "server", retryable: true, ambiguous: true };
  }
  return { kind: "unknown", retryable: false, ambiguous: false };
}

export function mapMurekaHttpErrorToMusicError(error: MurekaHttpError): MusicProviderError {
  switch (error.kind) {
    case "validation":
      return new MusicInvalidPromptError(MUREKA_PROVIDER_ID, error.message);
    case "insufficient_balance":
      return new MusicInsufficientCreditsError(MUREKA_PROVIDER_ID, error.message);
    case "rate_limit":
    case "capacity":
      return new MusicRateLimitError(MUREKA_PROVIDER_ID, error.message);
    case "timeout":
      return new MusicTimeoutError(MUREKA_PROVIDER_ID, error.message);
    case "server":
    case "network":
      return new MusicProviderUnavailableError(MUREKA_PROVIDER_ID, error.message, error);
    case "authentication":
    case "permission":
    case "configuration":
      return new MusicProviderError(
        error.message,
        "MUREKA_CONFIG_ERROR",
        MUREKA_PROVIDER_ID,
        error.httpStatus ?? 502,
        error,
      );
    default:
      return new MusicGenerationFailedError(MUREKA_PROVIDER_ID, error.message);
  }
}

export function assertNoSecretInText(text: unknown, apiKey: string): void {
  // Vendor error payloads sometimes put non-string `message`/`error` values.
  // Coerce before `.includes` so classification is not masked as a network error.
  const haystack = typeof text === "string" ? text : text == null ? "" : String(text);
  if (apiKey && haystack.includes(apiKey)) {
    throw new Error("Refusing to expose Mureka API key in error/log text");
  }
}

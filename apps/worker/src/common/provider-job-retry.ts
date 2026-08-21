import {
  MusicInvalidPromptError,
  MusicProviderUnavailableError,
  MusicRateLimitError,
  MusicTimeoutError,
} from "@ai-music/ai-providers";
import { UnrecoverableError } from "bullmq";

export type ProviderJobAttempt = {
  attempt: number;
  maxAttempts: number;
};

export function isLastProviderJobAttempt(attempt: ProviderJobAttempt): boolean {
  return attempt.attempt >= attempt.maxAttempts;
}

export function isRetryableProviderError(error: unknown): boolean {
  if (
    error instanceof MusicRateLimitError ||
    error instanceof MusicProviderUnavailableError ||
    error instanceof MusicTimeoutError
  ) {
    return true;
  }

  if (error instanceof MusicInvalidPromptError) {
    return false;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("music generation record not found")) {
      return false;
    }

    if (
      message.includes("econnreset") ||
      message.includes("etimedout") ||
      message.includes("fetch failed") ||
      message.includes("network")
    ) {
      return true;
    }
  }

  return false;
}

export function wrapProviderJobError(error: unknown, retryable: boolean): Error {
  const message = error instanceof Error ? error.message : "Provider job failed";

  if (!retryable) {
    return new UnrecoverableError(message);
  }

  return error instanceof Error ? error : new Error(message);
}

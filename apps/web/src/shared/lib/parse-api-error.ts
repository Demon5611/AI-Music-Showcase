import { ApiError } from "@ai-music/api-client";
import { isMusicProviderCapacityError } from "@ai-music/shared";

export interface ParseApiErrorOptions {
  includeUnauthorized?: boolean;
  includeServerHint?: boolean;
  /**
   * When true, unknown API `body.error` / Error.message are ignored in favor of
   * `fallback` (billing UI: avoid raw RU backend messages in EN locale).
   */
  preferFallback?: boolean;
  /**
   * Localized overrides for known API codes / capacity errors.
   * When omitted, English-safe fallbacks are used (callers should pass translations).
   */
  translations?: Partial<{
    insufficientCredits: string;
    featureNotAvailable: string;
    durationLimitExceeded: string;
    editorOperationNotAllowed: string;
    contentModeration: string;
    providerCapacity: string;
    unauthorized: string;
    serverHint: string;
  }>;
}

const DEFAULT_INSUFFICIENT =
  "Not enough credits. Top up your balance on the pricing page.";
const DEFAULT_FEATURE =
  "This feature is not available on your plan. Go to the pricing page.";
const DEFAULT_DURATION = "Track duration limit exceeded for your plan.";
const DEFAULT_EDITOR = "This editor operation requires a higher plan.";
const DEFAULT_CAPACITY =
  "The music service is temporarily overloaded. Please try again shortly.";

export function parseApiError(
  error: unknown,
  fallback: string,
  options: ParseApiErrorOptions = {},
): string {
  const {
    includeUnauthorized = false,
    includeServerHint = false,
    preferFallback = false,
    translations,
  } = options;

  if (error instanceof ApiError && error.body && typeof error.body === "object") {
    const body = error.body as { error?: string; code?: string };

    if (body.code === "INSUFFICIENT_CREDITS") {
      return translations?.insufficientCredits ?? DEFAULT_INSUFFICIENT;
    }

    if (body.code === "FEATURE_NOT_AVAILABLE") {
      return translations?.featureNotAvailable ?? body.error ?? DEFAULT_FEATURE;
    }

    if (body.code === "DURATION_LIMIT_EXCEEDED") {
      return translations?.durationLimitExceeded ?? body.error ?? DEFAULT_DURATION;
    }

    if (body.code === "EDITOR_OPERATION_NOT_ALLOWED") {
      return translations?.editorOperationNotAllowed ?? body.error ?? DEFAULT_EDITOR;
    }

    if (body.code === "CONTENT_MODERATION") {
      return translations?.contentModeration ?? body.error ?? fallback;
    }

    if (body.error) {
      if (isMusicProviderCapacityError(body.error)) {
        return translations?.providerCapacity ?? DEFAULT_CAPACITY;
      }

      if (preferFallback) {
        return fallback;
      }

      return body.error;
    }
  }

  if (includeUnauthorized && error instanceof ApiError && error.status === 401) {
    return translations?.unauthorized ?? "Unauthorized";
  }

  if (includeServerHint && error instanceof ApiError && error.status >= 500) {
    return (
      translations?.serverHint ??
      `${error.status} — check that Docker, API are running and pnpm db:push was applied`
    );
  }

  if (error instanceof Error) {
    if (isMusicProviderCapacityError(error.message)) {
      return translations?.providerCapacity ?? DEFAULT_CAPACITY;
    }

    if (preferFallback) {
      return fallback;
    }

    return error.message;
  }

  return fallback;
}

export const resolveErrorMessage = parseApiError;

type ApiErrorTranslationKey =
  | "insufficientCredits"
  | "featureNotAvailable"
  | "durationLimitExceeded"
  | "editorOperationNotAllowed"
  | "contentModeration"
  | "providerCapacity";

/** Build translations map from next-intl Errors namespace. */
export function buildApiErrorTranslations(
  t: (key: ApiErrorTranslationKey) => string,
): NonNullable<ParseApiErrorOptions["translations"]> {
  return {
    insufficientCredits: t("insufficientCredits"),
    featureNotAvailable: t("featureNotAvailable"),
    durationLimitExceeded: t("durationLimitExceeded"),
    editorOperationNotAllowed: t("editorOperationNotAllowed"),
    contentModeration: t("contentModeration"),
    providerCapacity: t("providerCapacity"),
  };
}

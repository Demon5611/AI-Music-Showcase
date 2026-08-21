export function initApiSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();

  if (!dsn) {
    return;
  }

  // Lazy integration point: install @sentry/node and call Sentry.init({ dsn, ... }) here.
  console.info("[sentry] SENTRY_DSN configured; add @sentry/node init when enabling APM");
}

export function captureApiException(error: unknown, context?: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN?.trim()) {
    return;
  }

  console.error("[sentry:capture]", { error, context });
}

"use client";

/**
 * Root emergency boundary outside the locale NextIntl provider.
 * Keep copy minimal English; do not depend on next-intl here.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            margin: "0 auto",
            maxWidth: "40rem",
            padding: "3rem 1.5rem",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1>Something went wrong</h1>
          <p>An unexpected error occurred. Please try again.</p>
          <button type="button" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

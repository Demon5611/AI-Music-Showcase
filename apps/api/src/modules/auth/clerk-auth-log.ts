/**
 * Safe Clerk auth diagnostics. Never log tokens, secrets, emails, or full payloads.
 */

export type ClerkAuthLogEvent =
  | "clerk_token_verification_failed"
  | "clerk_token_missing_sub"
  | "clerk_user_fetch_failed"
  | "clerk_user_email_missing"
  | "clerk_auth_verified";

export type ClerkAuthLogFields = Record<string, unknown>;

export type ClerkAuthLogger = (
  event: ClerkAuthLogEvent,
  fields?: ClerkAuthLogFields,
) => void;

export function resolveClerkSecretKeyKind(
  secretKey: string | undefined,
): "sk_test" | "sk_live" | "missing" | "unknown" {
  if (!secretKey?.trim()) {
    return "missing";
  }
  if (secretKey.startsWith("sk_test_")) {
    return "sk_test";
  }
  if (secretKey.startsWith("sk_live_")) {
    return "sk_live";
  }
  return "unknown";
}

export function createClerkAuthLogger(
  baseFields: ClerkAuthLogFields = {},
): ClerkAuthLogger {
  return (event, fields = {}) => {
    console.info(
      JSON.stringify({
        scope: "auth",
        event,
        ts: new Date().toISOString(),
        ...baseFields,
        ...fields,
      }),
    );
  };
}

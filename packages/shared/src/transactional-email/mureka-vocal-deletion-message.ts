/**
 * Minimal Mureka Vocal deletion email — Vocal IDs + requestId only (no user PII).
 */

export type MurekaVocalDeletionEmailInput = {
  requestId: string;
  vocalIds: string[];
};

export function buildMurekaVocalDeletionEmailSubject(requestId: string): string {
  return `Mureka Vocal Data Deletion Request - ${requestId}`;
}

export function buildMurekaVocalDeletionEmailBody(input: MurekaVocalDeletionEmailInput): string {
  const ids = input.vocalIds
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => `- ${id}`)
    .join("\n");

  return [
    "Hello Mureka Support,",
    "",
    "We are requesting deletion of vocal clone data associated with a user who has deleted their account from our service.",
    "",
    "Please permanently delete the following Vocal IDs from our Mureka account:",
    "",
    ids,
    "",
    `Request ID: ${input.requestId}`,
    "",
    "Please confirm once the deletion has been completed.",
    "",
    "Thank you.",
  ].join("\n");
}

/** Strip secrets / PII-ish noise from provider errors before DB / logs. */
export function sanitizeProviderDeletionEmailError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").trim().slice(0, 500) || "email_send_failed";
  }
  if (typeof error === "string") {
    return error.replace(/\s+/g, " ").trim().slice(0, 500) || "email_send_failed";
  }
  return "email_send_failed";
}

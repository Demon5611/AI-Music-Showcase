/**
 * Pure helpers for Resend inbound → internal forward (no open relay).
 */

import {
  RESEND_INBOUND_DEPLOYED_ADDRESSES,
  type ResendInboundAppEnv,
} from "./resolve-inbound-env.js";

export const INBOUND_ATTACHMENT_MAX_COUNT = 5;
export const INBOUND_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const INBOUND_ATTACHMENT_MAX_TOTAL_BYTES = 10 * 1024 * 1024;
export const INBOUND_STAGING_SUBJECT_PREFIX = "[STAGING]";

export function normalizeEmailAddress(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const match = trimmed.match(/<([^>]+)>/);
  return (match?.[1] ?? trimmed).trim().toLowerCase();
}

export function extractEmailAddress(value: string): string {
  return normalizeEmailAddress(value);
}

export function addressesIncludeTarget(
  addresses: readonly string[],
  target: string,
): boolean {
  const normalizedTarget = normalizeEmailAddress(target);
  return addresses.some((address) => normalizeEmailAddress(address) === normalizedTarget);
}

export function isAllowedInboundRecipient(input: {
  to: readonly string[];
  receivedFor?: readonly string[];
  inboundAddress: string;
}): boolean {
  if (addressesIncludeTarget(input.to, input.inboundAddress)) {
    return true;
  }
  if (input.receivedFor && addressesIncludeTarget(input.receivedFor, input.inboundAddress)) {
    return true;
  }
  return false;
}

/**
 * Prevent forwarding loops: ignore mail from either deployed inbound alias,
 * the internal forward target, or the configured From identity.
 */
export function shouldIgnoreInboundForLoop(input: {
  from: string;
  inboundAddress: string;
  forwardTo: string;
  fromIdentity: string;
}): boolean {
  const from = normalizeEmailAddress(input.from);
  if (!from) {
    return true;
  }

  const blocked = new Set<string>([
    normalizeEmailAddress(input.inboundAddress),
    normalizeEmailAddress(input.forwardTo),
    normalizeEmailAddress(input.fromIdentity),
    ...RESEND_INBOUND_DEPLOYED_ADDRESSES.map((address) => normalizeEmailAddress(address)),
  ]);

  return blocked.has(from);
}

/**
 * True when webhook/payload already lists recipients and none match this env's
 * inbound address (exact mailbox match only — no substring).
 */
export function hasVisibleInboundRecipients(input: {
  to?: readonly string[];
  receivedFor?: readonly string[];
}): boolean {
  return (input.to?.length ?? 0) > 0 || (input.receivedFor?.length ?? 0) > 0;
}

/** Collapse stacked Fwd:/Fw: prefixes; do not add another Fwd. */
export function normalizeInboundForwardSubject(subject: string | null | undefined): string {
  const raw = (subject ?? "").trim();
  if (!raw) {
    return "(no subject)";
  }

  let current = raw;
  for (let i = 0; i < 8; i += 1) {
    const next = current.replace(/^(fwd|fw)\s*:\s*/i, "").trim();
    if (next === current) {
      break;
    }
    current = next;
  }

  return current.length > 0 ? current : "(no subject)";
}

/**
 * Production keeps the original subject.
 * Staging prefixes once with [STAGING] (no stacking on retry/re-forward).
 */
export function buildInboundForwardSubject(input: {
  subject: string | null | undefined;
  appEnv: ResendInboundAppEnv;
}): string {
  const normalized = normalizeInboundForwardSubject(input.subject);
  if (input.appEnv !== "staging") {
    return normalized;
  }

  if (/^\[STAGING\](\s|$)/i.test(normalized)) {
    return normalized;
  }

  return `${INBOUND_STAGING_SUBJECT_PREFIX} ${normalized}`;
}

export function buildInboundEnvironmentHeader(
  appEnv: ResendInboundAppEnv,
): "production" | "staging" | "development" {
  return appEnv;
}

export function buildInboundForwardIdempotencyKey(emailId: string): string {
  return `resend-inbound-forward:${emailId.trim()}`;
}

export function buildInboundWebhookEventId(emailId: string): string {
  return `inbound-email:${emailId.trim()}`;
}

export type InboundAttachmentNote = {
  id: string;
  filename: string | null;
  contentType: string | null;
  size: number | null;
  included: boolean;
  reason?: string;
};

export function buildInboundForwardBodies(input: {
  originalFrom: string;
  originalTo: string[];
  originalSubject: string | null;
  text: string | null;
  html: string | null;
  attachmentNotes: InboundAttachmentNote[];
}): { text: string; html: string } {
  const toLine = input.originalTo.join(", ") || "(unknown)";
  const subjectLine = input.originalSubject?.trim() || "(no subject)";
  const attachmentLines =
    input.attachmentNotes.length === 0
      ? ["Attachments: none"]
      : [
          "Attachments:",
          ...input.attachmentNotes.map((note) => {
            const name = note.filename || note.id;
            const size =
              typeof note.size === "number" ? `, ${note.size} bytes` : "";
            const type = note.contentType ? `, ${note.contentType}` : "";
            if (note.included) {
              return `- ${name}${type}${size} (attached)`;
            }
            return `- ${name}${type}${size} (not attached: ${note.reason ?? "skipped"})`;
          }),
        ];

  const envelope = [
    "--- AI Music inbound ---",
    `From: ${input.originalFrom}`,
    `To: ${toLine}`,
    `Subject: ${subjectLine}`,
    ...attachmentLines,
    "---",
    "",
  ].join("\n");

  const textBody = `${envelope}${input.text?.trim() || "(empty text body)"}`;

  const htmlEnvelope = [
    "<p><strong>AI Music inbound</strong></p>",
    `<p>From: ${escapeHtml(input.originalFrom)}<br/>`,
    `To: ${escapeHtml(toLine)}<br/>`,
    `Subject: ${escapeHtml(subjectLine)}</p>`,
    `<pre>${escapeHtml(attachmentLines.join("\n"))}</pre>`,
    "<hr/>",
  ].join("");

  const htmlBody = input.html?.trim()
    ? `${htmlEnvelope}${input.html}`
    : `${htmlEnvelope}<pre>${escapeHtml(input.text?.trim() || "(empty text body)")}</pre>`;

  return { text: textBody, html: htmlBody };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function selectInboundAttachmentsForForward(input: {
  attachments: Array<{
    id: string;
    filename: string | null;
    contentType: string | null;
    size: number | null;
    downloadUrl: string;
  }>;
  maxCount?: number;
  maxBytes?: number;
  maxTotalBytes?: number;
}): {
  include: Array<{
    id: string;
    filename: string | null;
    contentType: string | null;
    size: number | null;
    downloadUrl: string;
  }>;
  notes: InboundAttachmentNote[];
} {
  const maxCount = input.maxCount ?? INBOUND_ATTACHMENT_MAX_COUNT;
  const maxBytes = input.maxBytes ?? INBOUND_ATTACHMENT_MAX_BYTES;
  const maxTotalBytes = input.maxTotalBytes ?? INBOUND_ATTACHMENT_MAX_TOTAL_BYTES;

  const include: typeof input.attachments = [];
  const notes: InboundAttachmentNote[] = [];
  let total = 0;

  for (const [index, attachment] of input.attachments.entries()) {
    const size = attachment.size;
    if (include.length >= maxCount) {
      notes.push({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        size,
        included: false,
        reason: "count_limit",
      });
      continue;
    }

    if (typeof size === "number" && size > maxBytes) {
      notes.push({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        size,
        included: false,
        reason: "size_limit",
      });
      continue;
    }

    if (typeof size === "number" && total + size > maxTotalBytes) {
      notes.push({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        size,
        included: false,
        reason: "total_size_limit",
      });
      continue;
    }

    // Unknown size: allow until count/total hard-fail on download.
    if (index >= 0) {
      include.push(attachment);
      if (typeof size === "number") {
        total += size;
      }
      notes.push({
        id: attachment.id,
        filename: attachment.filename,
        contentType: attachment.contentType,
        size,
        included: true,
      });
    }
  }

  return { include, notes };
}

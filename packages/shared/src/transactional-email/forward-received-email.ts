/**
 * Fetch received email via Resend and forward to the internal inbox.
 * From = verified domain identity; Reply-To = original sender (no spoofing).
 */

import {
  buildInboundEnvironmentHeader,
  buildInboundForwardBodies,
  buildInboundForwardIdempotencyKey,
  buildInboundForwardSubject,
  hasVisibleInboundRecipients,
  isAllowedInboundRecipient,
  selectInboundAttachmentsForForward,
  shouldIgnoreInboundForLoop,
  type InboundAttachmentNote,
} from "./inbound-forward.js";
import {
  downloadResendAttachmentBytes,
  getReceivedEmailViaResend,
  listReceivedAttachmentsViaResend,
} from "./resend-receiving.js";
import {
  ResendSendError,
  sendEmailViaResend,
  type ResendSendAttachment,
  type ResendSendResult,
} from "./resend-send.js";
import type { ResendInboundEnv } from "./resolve-inbound-env.js";

export type ForwardReceivedEmailResult =
  | { status: "forwarded"; messageId: string | null; emailId: string }
  | { status: "ignored"; reason: string; emailId: string };

export async function forwardReceivedEmailViaResend(input: {
  emailId: string;
  config: ResendInboundEnv;
  /** Optional webhook metadata recipients — used before fetch when present. */
  webhookTo?: string[];
  webhookReceivedFor?: string[];
  webhookFrom?: string;
}): Promise<ForwardReceivedEmailResult> {
  const emailId = input.emailId.trim();
  if (!emailId) {
    throw new ResendSendError("missing_email_id", { retryable: false });
  }

  if (
    input.webhookFrom &&
    shouldIgnoreInboundForLoop({
      from: input.webhookFrom,
      inboundAddress: input.config.inboundAddress,
      forwardTo: input.config.forwardTo,
      fromIdentity: input.config.fromIdentity,
    })
  ) {
    return { status: "ignored", reason: "loop_from_blocked", emailId };
  }

  if (
    hasVisibleInboundRecipients({
      to: input.webhookTo,
      receivedFor: input.webhookReceivedFor,
    }) &&
    !isAllowedInboundRecipient({
      to: input.webhookTo ?? [],
      receivedFor: input.webhookReceivedFor,
      inboundAddress: input.config.inboundAddress,
    })
  ) {
    return { status: "ignored", reason: "recipient_not_allowed", emailId };
  }

  const received = await getReceivedEmailViaResend({
    apiKey: input.config.apiKey,
    emailId,
  });

  if (
    shouldIgnoreInboundForLoop({
      from: received.from,
      inboundAddress: input.config.inboundAddress,
      forwardTo: input.config.forwardTo,
      fromIdentity: input.config.fromIdentity,
    })
  ) {
    return { status: "ignored", reason: "loop_from_blocked", emailId };
  }

  if (
    !isAllowedInboundRecipient({
      to: received.to,
      receivedFor: received.receivedFor,
      inboundAddress: input.config.inboundAddress,
    })
  ) {
    return { status: "ignored", reason: "recipient_not_allowed", emailId };
  }

  const listed =
    received.attachments.length > 0
      ? await listReceivedAttachmentsViaResend({
          apiKey: input.config.apiKey,
          emailId,
        })
      : [];

  const selected = selectInboundAttachmentsForForward({
    attachments: listed.map((row) => ({
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      size: row.size,
      downloadUrl: row.downloadUrl,
    })),
  });

  const sendAttachments: ResendSendAttachment[] = [];
  const notes: InboundAttachmentNote[] = [...selected.notes];

  for (const attachment of selected.include) {
    try {
      const bytes = await downloadResendAttachmentBytes({
        downloadUrl: attachment.downloadUrl,
        maxBytes: 5 * 1024 * 1024,
      });
      sendAttachments.push({
        filename: attachment.filename || attachment.id,
        content: bytes.toString("base64"),
        content_type: attachment.contentType ?? undefined,
      });
    } catch {
      const noteIndex = notes.findIndex((n) => n.id === attachment.id);
      if (noteIndex >= 0) {
        notes[noteIndex] = {
          ...notes[noteIndex]!,
          included: false,
          reason: "download_failed_or_oversized",
        };
      }
    }
  }

  const bodies = buildInboundForwardBodies({
    originalFrom: received.from,
    originalTo: received.to,
    originalSubject: received.subject,
    text: received.text,
    html: received.html,
    attachmentNotes: notes,
  });

  const headers: Record<string, string> = {
    "X-AI-Music-Environment": buildInboundEnvironmentHeader(input.config.appEnv),
  };
  if (received.messageId?.trim()) {
    // Preserve correlation without inventing Message-ID.
    headers["X-Original-Message-ID"] = received.messageId.trim();
  }

  const replyTo = received.from.trim();
  const result: ResendSendResult = await sendEmailViaResend({
    apiKey: input.config.apiKey,
    from: input.config.fromIdentity,
    to: input.config.forwardTo,
    subject: buildInboundForwardSubject({
      subject: received.subject,
      appEnv: input.config.appEnv,
    }),
    text: bodies.text,
    html: bodies.html,
    replyTo,
    headers,
    attachments: sendAttachments.length > 0 ? sendAttachments : undefined,
    idempotencyKey: buildInboundForwardIdempotencyKey(emailId),
  });

  return {
    status: "forwarded",
    messageId: result.messageId,
    emailId,
  };
}

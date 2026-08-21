/**
 * Resend Receiving API — fetch inbound email content and attachment metadata.
 * Never fetches arbitrary URLs from email body content.
 */

import { ResendSendError } from "./resend-send.js";

export type ResendReceivedAttachmentMeta = {
  id: string;
  filename: string | null;
  contentType: string | null;
  contentDisposition: string | null;
  contentId: string | null;
  size: number | null;
};

export type ResendReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  messageId: string | null;
  receivedFor: string[];
  attachments: ResendReceivedAttachmentMeta[];
};

export type ResendReceivedAttachmentDownload = ResendReceivedAttachmentMeta & {
  downloadUrl: string;
  expiresAt: string | null;
};

const RESEND_API_BASE = "https://api.resend.com";

function isAllowedResendAttachmentHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "inbound-cdn.resend.com" || host.endsWith(".resend.com");
}

/** Only Resend-signed attachment download URLs are allowed. */
export function isAllowedResendAttachmentDownloadUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && isAllowedResendAttachmentHost(parsed.hostname);
  } catch {
    return false;
  }
}

async function parseResendJson<T>(response: Response): Promise<T> {
  const raw = await response.text();
  let parsed: unknown = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    const message =
      typeof parsed === "object" &&
      parsed &&
      "message" in parsed &&
      typeof (parsed as { message?: unknown }).message === "string"
        ? (parsed as { message: string }).message.slice(0, 200)
        : `resend_http_${response.status}`;
    // 404 on receiving can race webhook delivery; allow Resend retries.
    const retryable =
      response.status === 404 || response.status === 429 || response.status >= 500;
    throw new ResendSendError(message, { statusCode: response.status, retryable });
  }

  return parsed as T;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function mapAttachmentMeta(raw: Record<string, unknown>): ResendReceivedAttachmentMeta {
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    filename: typeof raw.filename === "string" ? raw.filename : null,
    contentType: typeof raw.content_type === "string" ? raw.content_type : null,
    contentDisposition:
      typeof raw.content_disposition === "string" ? raw.content_disposition : null,
    contentId: typeof raw.content_id === "string" ? raw.content_id : null,
    size: typeof raw.size === "number" && Number.isFinite(raw.size) ? raw.size : null,
  };
}

export async function getReceivedEmailViaResend(input: {
  apiKey: string;
  emailId: string;
}): Promise<ResendReceivedEmail> {
  const emailId = encodeURIComponent(input.emailId);
  const response = await fetch(`${RESEND_API_BASE}/emails/receiving/${emailId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
    },
  });

  const parsed = await parseResendJson<Record<string, unknown>>(response);
  const attachmentsRaw = Array.isArray(parsed.attachments) ? parsed.attachments : [];

  return {
    id: typeof parsed.id === "string" ? parsed.id : input.emailId,
    from: typeof parsed.from === "string" ? parsed.from : "",
    to: asStringArray(parsed.to),
    cc: asStringArray(parsed.cc),
    bcc: asStringArray(parsed.bcc),
    replyTo: asStringArray(parsed.reply_to),
    subject: typeof parsed.subject === "string" ? parsed.subject : null,
    text: typeof parsed.text === "string" ? parsed.text : null,
    html: typeof parsed.html === "string" ? parsed.html : null,
    messageId: typeof parsed.message_id === "string" ? parsed.message_id : null,
    receivedFor: asStringArray(parsed.received_for),
    attachments: attachmentsRaw
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map(mapAttachmentMeta)
      .filter((item) => item.id.length > 0),
  };
}

export async function listReceivedAttachmentsViaResend(input: {
  apiKey: string;
  emailId: string;
}): Promise<ResendReceivedAttachmentDownload[]> {
  const emailId = encodeURIComponent(input.emailId);
  const response = await fetch(
    `${RESEND_API_BASE}/emails/receiving/${emailId}/attachments`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
      },
    },
  );

  const parsed = await parseResendJson<{ data?: unknown }>(response);
  const rows = Array.isArray(parsed.data) ? parsed.data : [];

  return rows
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((raw) => {
      const meta = mapAttachmentMeta(raw);
      return {
        ...meta,
        downloadUrl: typeof raw.download_url === "string" ? raw.download_url : "",
        expiresAt: typeof raw.expires_at === "string" ? raw.expires_at : null,
      };
    })
    .filter((item) => item.id.length > 0 && item.downloadUrl.length > 0);
}

export async function downloadResendAttachmentBytes(input: {
  downloadUrl: string;
  maxBytes: number;
}): Promise<Buffer> {
  if (!isAllowedResendAttachmentDownloadUrl(input.downloadUrl)) {
    throw new ResendSendError("attachment_download_host_not_allowed", {
      retryable: false,
    });
  }

  const response = await fetch(input.downloadUrl, { method: "GET", redirect: "error" });
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw new ResendSendError(`attachment_download_http_${response.status}`, {
      statusCode: response.status,
      retryable,
    });
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > input.maxBytes) {
throw new ResendSendError("attachment_too_large", {
      retryable: false,
    });
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > input.maxBytes) {
    throw new ResendSendError("attachment_too_large", {
      retryable: false,
    });
  }

  return Buffer.from(arrayBuffer);
}

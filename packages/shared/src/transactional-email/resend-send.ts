/**
 * Minimal Resend HTTP client (fetch). Shared by worker and API (inbound forward).
 */

export type ResendSendAttachment = {
  filename: string;
  content: string;
  content_type?: string;
  content_id?: string;
};

export type ResendSendInput = {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string | string[];
  headers?: Record<string, string>;
  attachments?: ResendSendAttachment[];
  /** Resend Idempotency-Key — prevents duplicate delivery on retries. */
  idempotencyKey: string;
};

export type ResendSendResult = {
  messageId: string | null;
};

export class ResendSendError extends Error {
  readonly statusCode: number | null;
  readonly retryable: boolean;

  constructor(message: string, options?: { statusCode?: number; retryable?: boolean }) {
    super(message);
    this.name = "ResendSendError";
    this.statusCode = options?.statusCode ?? null;
    this.retryable = options?.retryable ?? true;
  }
}

export async function sendEmailViaResend(input: ResendSendInput): Promise<ResendSendResult> {
  const body: Record<string, unknown> = {
    from: input.from,
    to: [input.to],
    subject: input.subject,
    text: input.text,
  };

  if (input.html) {
    body.html = input.html;
  }

  if (input.replyTo) {
    body.reply_to = input.replyTo;
  }

  if (input.headers && Object.keys(input.headers).length > 0) {
    body.headers = input.headers;
  }

  if (input.attachments && input.attachments.length > 0) {
    body.attachments = input.attachments;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();
  let parsed: { id?: string; message?: string; name?: string } = {};
  try {
    parsed = raw ? (JSON.parse(raw) as typeof parsed) : {};
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw new ResendSendError(
      parsed.message?.slice(0, 200) || `resend_http_${response.status}`,
      { statusCode: response.status, retryable },
    );
  }

  return {
    messageId: typeof parsed.id === "string" && parsed.id.length > 0 ? parsed.id : null,
  };
}

export function resolveTransactionalEmailFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): {
  apiKey: string | null;
  from: string | null;
  murekaDataDeletionTo: string | null;
} {
  const apiKey = env.RESEND_API_KEY?.trim() || null;
  const from =
    env.TRANSACTIONAL_EMAIL_FROM?.trim() ||
    env.EMAIL_FROM?.trim() ||
    null;
  const murekaDataDeletionTo = env.MUREKA_DATA_DELETION_EMAIL?.trim() || null;
  return { apiKey, from, murekaDataDeletionTo };
}

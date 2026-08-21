/**
 * Mureka Vocal ID deletion email — shared send path (API notifier + worker).
 * Never includes user PII (email, Clerk id, sample URLs).
 */
import {
  buildMurekaVocalDeletionEmailBody,
  buildMurekaVocalDeletionEmailSubject,
} from "./mureka-vocal-deletion-message.js";
import {
  ResendSendError,
  resolveTransactionalEmailFromEnv,
  sendEmailViaResend,
  type ResendSendResult,
} from "./resend-send.js";

export type SendMurekaVocalDeletionEmailInput = {
  requestId: string;
  vocalIds: string[];
  idempotencyKey: string;
  env?: NodeJS.ProcessEnv;
};

export type SendMurekaVocalDeletionEmailResult =
  | { status: "sent"; messageId: string | null }
  | { status: "failed"; reason: string; retryable: boolean };

export async function sendMurekaVocalDeletionEmail(
  input: SendMurekaVocalDeletionEmailInput,
): Promise<SendMurekaVocalDeletionEmailResult> {
  const mail = resolveTransactionalEmailFromEnv(input.env);
  if (!mail.apiKey || !mail.from || !mail.murekaDataDeletionTo) {
    return {
      status: "failed",
      reason: "email_provider_not_configured",
      retryable: false,
    };
  }

  const vocalIds = input.vocalIds.map((id) => id.trim()).filter(Boolean);
  if (vocalIds.length === 0) {
    return {
      status: "failed",
      reason: "missing_provider_external_id",
      retryable: false,
    };
  }

  try {
    const result: ResendSendResult = await sendEmailViaResend({
      apiKey: mail.apiKey,
      from: mail.from,
      to: mail.murekaDataDeletionTo,
      subject: buildMurekaVocalDeletionEmailSubject(input.requestId),
      text: buildMurekaVocalDeletionEmailBody({
        requestId: input.requestId,
        vocalIds,
      }),
      idempotencyKey: input.idempotencyKey,
    });
    return { status: "sent", messageId: result.messageId };
  } catch (error) {
    const retryable = error instanceof ResendSendError ? error.retryable : true;
    const reason =
      error instanceof Error
        ? error.message.replace(/\s+/g, " ").trim().slice(0, 500)
        : "email_send_failed";
    return {
      status: "failed",
      reason: reason || "email_send_failed",
      retryable,
    };
  }
}

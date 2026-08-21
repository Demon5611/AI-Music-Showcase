/**
 * Provider-neutral transactional email boundary.
 * Account-completion: Noop by default until a real provider is wired.
 * Mureka Vocal deletion: Resend via shared sendMurekaVocalDeletionEmail (worker path).
 */

import {
  sendMurekaVocalDeletionEmail,
  type SendMurekaVocalDeletionEmailResult,
} from "@ai-music/shared";

export type AccountDeletionCompleteEmailInput = {
  to: string;
  locale: "en" | "ru";
  /** Stable key for exactly-once send attempts at the caller. */
  idempotencyKey: string;
};

export type MurekaVocalDataDeletionEmailInput = {
  requestId: string;
  vocalIds: string[];
  idempotencyKey: string;
};

/**
 * Explicit delivery outcome for account-deletion email.
 * - sent: real provider accepted the message (safe to clear notificationEmail)
 * - deferred: notifier unavailable / noop (retain email, keep pending)
 * - failed: provider error (retain email, retry later)
 */
export type AccountEmailDeliveryStatus = "sent" | "deferred" | "failed";

export type AccountEmailSendResult = {
  status: AccountEmailDeliveryStatus;
  /** @deprecated Prefer `status`. Kept for transitional callers. */
  accepted: boolean;
  delivered: boolean;
  reason?: "noop" | "duplicate" | "provider_error" | "provider_accepted";
  messageId?: string | null;
};

export interface AccountEmailNotifier {
  sendAccountDeletionComplete(
    input: AccountDeletionCompleteEmailInput,
  ): Promise<AccountEmailSendResult>;
  sendMurekaVocalDataDeletion(
    input: MurekaVocalDataDeletionEmailInput,
  ): Promise<SendMurekaVocalDeletionEmailResult>;
}

/**
 * Safe default for user-facing account emails: does not claim a real send.
 * Mureka deletion emails use the shared Resend path when env is configured.
 */
export class NoopAccountEmailNotifier implements AccountEmailNotifier {
  readonly attempts: AccountDeletionCompleteEmailInput[] = [];
  readonly murekaAttempts: MurekaVocalDataDeletionEmailInput[] = [];

  /** @deprecated Use `attempts`. */
  get sent(): AccountDeletionCompleteEmailInput[] {
    return this.attempts;
  }

  async sendAccountDeletionComplete(
    input: AccountDeletionCompleteEmailInput,
  ): Promise<AccountEmailSendResult> {
    this.attempts.push(input);
    return {
      status: "deferred",
      accepted: false,
      delivered: false,
      reason: "noop",
    };
  }

  async sendMurekaVocalDataDeletion(
    input: MurekaVocalDataDeletionEmailInput,
  ): Promise<SendMurekaVocalDeletionEmailResult> {
    this.murekaAttempts.push(input);
    return sendMurekaVocalDeletionEmail(input);
  }
}

/** Test double: simulates a real provider accept. */
export class SuccessfulAccountEmailNotifier implements AccountEmailNotifier {
  readonly attempts: AccountDeletionCompleteEmailInput[] = [];
  readonly murekaAttempts: MurekaVocalDataDeletionEmailInput[] = [];

  async sendAccountDeletionComplete(
    input: AccountDeletionCompleteEmailInput,
  ): Promise<AccountEmailSendResult> {
    if (this.attempts.some((row) => row.idempotencyKey === input.idempotencyKey)) {
      return {
        status: "sent",
        accepted: true,
        delivered: true,
        reason: "duplicate",
      };
    }

    this.attempts.push(input);
    return {
      status: "sent",
      accepted: true,
      delivered: true,
      reason: "provider_accepted",
    };
  }

  async sendMurekaVocalDataDeletion(
    input: MurekaVocalDataDeletionEmailInput,
  ): Promise<SendMurekaVocalDeletionEmailResult> {
    this.murekaAttempts.push(input);
    return { status: "sent", messageId: `test_${input.requestId}` };
  }
}

/** Test double: simulates provider outage. */
export class FailingAccountEmailNotifier implements AccountEmailNotifier {
  async sendAccountDeletionComplete(): Promise<AccountEmailSendResult> {
    return {
      status: "failed",
      accepted: false,
      delivered: false,
      reason: "provider_error",
    };
  }

  async sendMurekaVocalDataDeletion(): Promise<SendMurekaVocalDeletionEmailResult> {
    return { status: "failed", reason: "provider_error", retryable: true };
  }
}

let notifier: AccountEmailNotifier = new NoopAccountEmailNotifier();

export function getAccountEmailNotifier(): AccountEmailNotifier {
  return notifier;
}

/** Tests / future provider wiring only. */
export function setAccountEmailNotifier(next: AccountEmailNotifier): void {
  notifier = next;
}

export function resetAccountEmailNotifierForTests(): void {
  notifier = new NoopAccountEmailNotifier();
}

export function isEmailSendSuccess(result: AccountEmailSendResult): boolean {
  return result.status === "sent";
}

export const ACCOUNT_DELETION_EMAIL_COPY = {
  en: {
    subject: "Your account has been deleted",
    body:
      "Account deletion is complete. Personal voice data associated with your account has been processed according to the deletion request. Your account is no longer available.",
  },
  ru: {
    subject: "Ваш аккаунт удалён",
    body:
      "Удаление аккаунта завершено. Персональные голосовые данные, связанные с вашим аккаунтом, были обработаны в соответствии с запросом на удаление. Ваш аккаунт больше недоступен.",
  },
} as const;

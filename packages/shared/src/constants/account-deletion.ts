/**
 * Account deletion lifecycle — independent from Personal AI Voice disable.
 * Disable ("My voice" off) must never create AccountDeletionRequest / provider tickets.
 */

export const ACCOUNT_DELETION_STATUSES = [
  "active",
  "deletion_requested",
  "provider_deletion_pending",
  "ready_for_finalization",
  "deleted",
] as const;

export type AccountDeletionStatus = (typeof ACCOUNT_DELETION_STATUSES)[number];

export const ACCOUNT_DELETION_BLOCKING_STATUSES = [
  "deletion_requested",
  "provider_deletion_pending",
  "ready_for_finalization",
  "deleted",
] as const satisfies readonly AccountDeletionStatus[];

export type AccountDeletionBlockingStatus =
  (typeof ACCOUNT_DELETION_BLOCKING_STATUSES)[number];

export function isAccountDeletionBlockingStatus(
  status: string | null | undefined,
): status is AccountDeletionBlockingStatus {
  return (ACCOUNT_DELETION_BLOCKING_STATUSES as readonly string[]).includes(
    status ?? "",
  );
}

export function isAccountActiveForProductUse(
  status: string | null | undefined,
): boolean {
  return !status || status === "active";
}

/** Idempotency key for account-deletion completion email. */
export function buildAccountDeletionEmailIdempotencyKey(userId: string): string {
  return `account_deletion:${userId}:completion_email`;
}

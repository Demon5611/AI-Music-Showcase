/**
 * Structured security / monetary-refund audit events.
 * Never log tokens, bank details, or full provider payloads.
 */
export type SecurityEventName =
  | "authorization_denied"
  | "refund_requested"
  | "refund_approved"
  | "refund_rejected"
  | "refund_processing"
  | "refund_completed"
  | "refund_failed"
  | "refund_needs_review"
  | "refund_enqueue_attempt"
  | "refund_enqueue_success"
  | "refund_enqueue_failed"
  | "refund_requeue_attempt"
  | "refund_requeue_success"
  | "refund_enqueue_recovery_success"
  | "refund_enqueue_recovery_failed";

export function logSecurityEvent(
  event: SecurityEventName,
  fields: Record<string, unknown>,
): void {
  console.info(
    JSON.stringify({
      scope: "security",
      event,
      ts: new Date().toISOString(),
      ...fields,
    }),
  );
}

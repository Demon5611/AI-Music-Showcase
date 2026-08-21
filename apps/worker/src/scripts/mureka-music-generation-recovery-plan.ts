export type MurekaMusicGenerationRecoveryPlan =
  | { action: "noop"; reason: string }
  | { action: "enqueue_poll"; providerTaskId: string }
  | { action: "fail_and_refund"; reason: string }
  | { action: "ambiguous_manual"; reason: string };

/**
 * Decide recovery for a stuck Mureka song generation.
 * Never chooses a blind provider re-submit.
 */
export function planMurekaMusicGenerationRecovery(input: {
  status: string;
  submissionState: string;
  providerTaskId: string;
  hasSpend: boolean;
  hasRefund: boolean;
}): MurekaMusicGenerationRecoveryPlan {
  if (input.status === "completed" || input.status === "partial_success") {
    return { action: "noop", reason: "already_terminal_success" };
  }
  if (input.status === "failed") {
    if (input.hasSpend && !input.hasRefund) {
      return { action: "fail_and_refund", reason: "failed_missing_refund" };
    }
    return { action: "noop", reason: "already_failed" };
  }

  const realTaskId =
    input.providerTaskId.trim() && !input.providerTaskId.startsWith("queue:")
      ? input.providerTaskId.trim()
      : null;

  if (realTaskId) {
    return { action: "enqueue_poll", providerTaskId: realTaskId };
  }

  if (input.submissionState === "submit_unknown" || input.submissionState === "dispatching") {
    return {
      action: "ambiguous_manual",
      reason: "possible_provider_accept_without_persisted_task_id",
    };
  }

  if (input.hasSpend && !input.hasRefund) {
    return { action: "fail_and_refund", reason: "pre_submit_queue_placeholder" };
  }

  return { action: "fail_and_refund", reason: "pre_submit_no_provider_task" };
}

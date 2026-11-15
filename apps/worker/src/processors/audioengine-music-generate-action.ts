/**
 * Pure recovery decision for audioengine_music_generate worker jobs.
 * Keeps provider submit / poll-only / terminal paths testable without BullMQ.
 */
export type AudioengineMusicGenerateAction =
  | { kind: "noop_terminal"; refundIfFailed: boolean }
  | { kind: "poll_only"; providerTaskId: string }
  | { kind: "wait_submit_unknown" }
  | { kind: "mark_orphan_dispatching" }
  | { kind: "submit" };

export function resolveAudioengineMusicGenerateAction(input: {
  status: string;
  submissionState: string;
  providerTaskId: string;
  recoveredProviderTaskId?: string | null;
}): AudioengineMusicGenerateAction {
  if (input.status === "completed" || input.status === "failed" || input.status === "partial_success") {
    return { kind: "noop_terminal", refundIfFailed: input.status === "failed" };
  }

  const recovered = input.recoveredProviderTaskId?.trim();
  if (recovered) {
    return { kind: "poll_only", providerTaskId: recovered };
  }

  if (input.submissionState === "submit_unknown") {
    return { kind: "wait_submit_unknown" };
  }

  if (input.submissionState === "dispatching") {
    return { kind: "mark_orphan_dispatching" };
  }

  // Real provider task id already present → never POST generate again.
  if (input.submissionState === "submitted" || !input.providerTaskId.startsWith("queue:")) {
    return { kind: "poll_only", providerTaskId: input.providerTaskId };
  }

  return { kind: "submit" };
}

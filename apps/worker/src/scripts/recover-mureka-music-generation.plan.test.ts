import assert from "node:assert/strict";
import { planMurekaMusicGenerationRecovery } from "./mureka-music-generation-recovery-plan.js";

function run() {
  assert.deepEqual(
    planMurekaMusicGenerationRecovery({
      status: "pending",
      submissionState: "queued",
      providerTaskId: "queue:abc",
      hasSpend: true,
      hasRefund: false,
    }),
    { action: "fail_and_refund", reason: "pre_submit_queue_placeholder" },
  );

  assert.deepEqual(
    planMurekaMusicGenerationRecovery({
      status: "processing",
      submissionState: "submitted",
      providerTaskId: "mureka-task-1",
      hasSpend: true,
      hasRefund: false,
    }),
    { action: "enqueue_poll", providerTaskId: "mureka-task-1" },
  );

  assert.deepEqual(
    planMurekaMusicGenerationRecovery({
      status: "pending",
      submissionState: "submit_unknown",
      providerTaskId: "queue:abc",
      hasSpend: true,
      hasRefund: false,
    }),
    {
      action: "ambiguous_manual",
      reason: "possible_provider_accept_without_persisted_task_id",
    },
  );

  console.log("mureka-music-generation-recovery-plan tests passed");
}

run();

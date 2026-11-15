import assert from "node:assert/strict";
import { planAudioengineMusicGenerationRecovery } from "./audioengine-music-generation-recovery-plan.js";

function run() {
  assert.deepEqual(
    planAudioengineMusicGenerationRecovery({
      status: "pending",
      submissionState: "queued",
      providerTaskId: "queue:abc",
      hasSpend: true,
      hasRefund: false,
    }),
    { action: "fail_and_refund", reason: "pre_submit_queue_placeholder" },
  );

  assert.deepEqual(
    planAudioengineMusicGenerationRecovery({
      status: "processing",
      submissionState: "submitted",
      providerTaskId: "audioengine-task-1",
      hasSpend: true,
      hasRefund: false,
    }),
    { action: "enqueue_poll", providerTaskId: "audioengine-task-1" },
  );

  assert.deepEqual(
    planAudioengineMusicGenerationRecovery({
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

  console.log("audioengine-music-generation-recovery-plan tests passed");
}

run();

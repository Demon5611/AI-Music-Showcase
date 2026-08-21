import assert from "node:assert/strict";
import { resolveMurekaMusicGenerateAction } from "./mureka-music-generate-action.js";

function run() {
  assert.deepEqual(
    resolveMurekaMusicGenerateAction({
      status: "completed",
      submissionState: "submitted",
      providerTaskId: "task-1",
    }),
    { kind: "noop_terminal", refundIfFailed: false },
  );

  assert.deepEqual(
    resolveMurekaMusicGenerateAction({
      status: "failed",
      submissionState: "failed",
      providerTaskId: "queue:x",
    }),
    { kind: "noop_terminal", refundIfFailed: true },
  );

  assert.deepEqual(
    resolveMurekaMusicGenerateAction({
      status: "processing",
      submissionState: "submitted",
      providerTaskId: "mureka-task-abc",
    }),
    { kind: "poll_only", providerTaskId: "mureka-task-abc" },
  );

  assert.deepEqual(
    resolveMurekaMusicGenerateAction({
      status: "pending",
      submissionState: "queued",
      providerTaskId: "queue:placeholder",
      recoveredProviderTaskId: "recovered-task",
    }),
    { kind: "poll_only", providerTaskId: "recovered-task" },
  );

  assert.deepEqual(
    resolveMurekaMusicGenerateAction({
      status: "pending",
      submissionState: "queued",
      providerTaskId: "queue:placeholder",
    }),
    { kind: "submit" },
  );

  assert.deepEqual(
    resolveMurekaMusicGenerateAction({
      status: "pending",
      submissionState: "submit_unknown",
      providerTaskId: "queue:placeholder",
    }),
    { kind: "wait_submit_unknown" },
  );

  // providerTaskId present (non-queue) even if submissionState lagged → poll only, no second submit.
  assert.deepEqual(
    resolveMurekaMusicGenerateAction({
      status: "pending",
      submissionState: "queued",
      providerTaskId: "already-accepted-task",
    }),
    { kind: "poll_only", providerTaskId: "already-accepted-task" },
  );

  console.log("mureka-music-generate-action tests passed");
}

run();

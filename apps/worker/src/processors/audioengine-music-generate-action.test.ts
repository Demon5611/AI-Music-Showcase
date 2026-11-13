import assert from "node:assert/strict";
import { resolveAudioengineMusicGenerateAction } from "./audioengine-music-generate-action.js";

function run() {
  assert.deepEqual(
    resolveAudioengineMusicGenerateAction({
      status: "completed",
      submissionState: "submitted",
      providerTaskId: "task-1",
    }),
    { kind: "noop_terminal", refundIfFailed: false },
  );

  assert.deepEqual(
    resolveAudioengineMusicGenerateAction({
      status: "failed",
      submissionState: "failed",
      providerTaskId: "queue:x",
    }),
    { kind: "noop_terminal", refundIfFailed: true },
  );

  assert.deepEqual(
    resolveAudioengineMusicGenerateAction({
      status: "processing",
      submissionState: "submitted",
      providerTaskId: "audioengine-task-abc",
    }),
    { kind: "poll_only", providerTaskId: "audioengine-task-abc" },
  );

  assert.deepEqual(
    resolveAudioengineMusicGenerateAction({
      status: "pending",
      submissionState: "queued",
      providerTaskId: "queue:placeholder",
      recoveredProviderTaskId: "recovered-task",
    }),
    { kind: "poll_only", providerTaskId: "recovered-task" },
  );

  assert.deepEqual(
    resolveAudioengineMusicGenerateAction({
      status: "pending",
      submissionState: "queued",
      providerTaskId: "queue:placeholder",
    }),
    { kind: "submit" },
  );

  assert.deepEqual(
    resolveAudioengineMusicGenerateAction({
      status: "pending",
      submissionState: "submit_unknown",
      providerTaskId: "queue:placeholder",
    }),
    { kind: "wait_submit_unknown" },
  );

  // providerTaskId present (non-queue) even if submissionState lagged → poll only, no second submit.
  assert.deepEqual(
    resolveAudioengineMusicGenerateAction({
      status: "pending",
      submissionState: "queued",
      providerTaskId: "already-accepted-task",
    }),
    { kind: "poll_only", providerTaskId: "already-accepted-task" },
  );

  console.log("audioengine-music-generate-action tests passed");
}

run();

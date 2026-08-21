/**
 * Unit tests for SunoMusicCallbackNormalizer.
 * Run: `pnpm --filter @ai-music/ai-providers exec tsx src/music/providers/suno-api/suno-callback.normalizer.test.ts`
 */
import assert from "node:assert/strict";
import { createSunoMusicCallbackNormalizer } from "./suno-callback.normalizer.js";

const normalizer = createSunoMusicCallbackNormalizer();

function basePayload(overrides: Record<string, unknown> = {}) {
  return {
    code: 200,
    msg: "ok",
    data: {
      callbackType: "complete",
      task_id: "task-1",
      data: [
        {
          id: "track-1",
          audio_url: "https://example.com/a.mp3",
          title: "Song",
        },
      ],
    },
    ...overrides,
  };
}

function run() {
  assert.equal(normalizer.id, "sunoapi");

  const malformed = normalizer.normalizeCallback({ not: "valid" });
  assert.equal(malformed.kind, "invalid_payload");

  const missingTask = normalizer.normalizeCallback({
    code: 200,
    data: { callbackType: "complete", data: [] },
  });
  assert.equal(missingTask.kind, "ignored");
  if (missingTask.kind === "ignored") {
    assert.equal(missingTask.reason, "missing_task_id");
    assert.equal(missingTask.providerTaskId, undefined);
  }

  const completed = normalizer.normalizeCallback(basePayload());
  assert.equal(completed.kind, "completed");
  if (completed.kind === "completed") {
    assert.equal(completed.providerTaskId, "task-1");
    assert.equal(completed.tracks.length, 1);
    assert.equal(completed.tracks[0]?.id, "track-1");
  }

  const progress = normalizer.normalizeCallback(
    basePayload({
      data: {
        callbackType: "first",
        task_id: "task-1",
        data: [{ id: "track-1", audio_url: "https://example.com/a.mp3" }],
      },
    }),
  );
  assert.equal(progress.kind, "progress");
  if (progress.kind === "progress") {
    assert.equal(progress.rawStatus, "FIRST_SUCCESS");
    assert.equal(progress.providerTaskId, "task-1");
  }

  const failed451 = normalizer.normalizeCallback({
    code: 451,
    msg: "download failed",
    data: { callbackType: "error", task_id: "task-fail", data: null },
  });
  assert.equal(failed451.kind, "failed");
  if (failed451.kind === "failed") {
    assert.equal(failed451.error.code, "DOWNLOAD_FAILED");
    assert.equal(failed451.error.rawCode, 451);
    assert.equal(failed451.providerTaskId, "task-fail");
    assert.equal("retryable" in failed451.error, false);
  }

  const transient = normalizer.normalizeCallback({
    code: 500,
    msg: "busy",
    data: { callbackType: "error", taskId: "task-tmp", data: null },
  });
  assert.equal(transient.kind, "ignored");
  if (transient.kind === "ignored") {
    assert.equal(transient.reason, "provider_transient");
    assert.equal(transient.providerTaskId, "task-tmp");
  }

  const unmapped = normalizer.normalizeCallback({
    code: 418,
    data: { task_id: "task-teapot" },
  });
  assert.equal(unmapped.kind, "ignored");
  if (unmapped.kind === "ignored") {
    assert.equal(unmapped.reason, "unmapped_code");
    assert.equal(unmapped.providerTaskId, "task-teapot");
  }

  const unknownEvent = normalizer.normalizeCallback({
    code: 200,
    data: { callbackType: undefined, task_id: "task-x", data: [] },
  });
  assert.equal(unknownEvent.kind, "ignored");
  if (unknownEvent.kind === "ignored") {
    assert.equal(unknownEvent.reason, "unknown_event");
    assert.equal(unknownEvent.providerTaskId, "task-x");
  }

  console.log("suno-callback.normalizer unit tests passed");
}

run();

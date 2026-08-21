/**
 * Unit tests for Suno album-cover callback normalizer.
 * Run: pnpm --filter @ai-music/ai-providers exec tsx src/music/providers/suno-api/suno-album-cover-callback.test.ts
 */
import assert from "node:assert/strict";
import { tryNormalizeSunoAlbumCoverCallback } from "./suno-album-cover-callback.js";

const coverSuccess = tryNormalizeSunoAlbumCoverCallback({
  code: 200,
  msg: "success",
  data: {
    taskId: "cover-task-1",
    images: [
      "https://example.com/a.png",
      "https://example.com/b.png",
    ],
  },
});
assert.equal(coverSuccess?.kind, "completed");
if (coverSuccess?.kind === "completed") {
  assert.equal(coverSuccess.coverTaskId, "cover-task-1");
  assert.equal(coverSuccess.images.length, 2);
}

const coverFail = tryNormalizeSunoAlbumCoverCallback({
  code: 501,
  msg: "Cover generation failed",
  data: { taskId: "cover-task-2", images: null },
});
assert.equal(coverFail?.kind, "failed");
if (coverFail?.kind === "failed") {
  assert.equal(coverFail.coverTaskId, "cover-task-2");
}

const musicComplete = tryNormalizeSunoAlbumCoverCallback({
  code: 200,
  data: {
    callbackType: "complete",
    task_id: "music-task-1",
    data: [{ id: "t1", audio_url: "https://example.com/a.mp3" }],
  },
});
assert.equal(musicComplete, null);

const malformed = tryNormalizeSunoAlbumCoverCallback({ not: "cover" });
assert.equal(malformed, null);

console.log("suno-album-cover-callback.test.ts: ok");

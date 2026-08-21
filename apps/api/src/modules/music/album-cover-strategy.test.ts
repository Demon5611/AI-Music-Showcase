/**
 * Provider-aware album cover strategy contract tests.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/album-cover-strategy.test.ts
 */
import assert from "node:assert/strict";
import {
  isAlbumCoverVariantsAvailable,
  resolveAlbumCoverStrategy,
} from "./album-cover-strategy.js";

function testSunoWithTaskIdUsesSunoCover(): void {
  const strategy = resolveAlbumCoverStrategy({
    musicProvider: "sunoapi",
    providerTaskId: "suno-music-task-1",
  });

  assert.equal(strategy.kind, "suno_music_task");
  if (strategy.kind === "suno_music_task") {
    assert.equal(strategy.sunoMusicTaskId, "suno-music-task-1");
  }
  assert.equal(isAlbumCoverVariantsAvailable("sunoapi"), true);
}

function testMurekaTaskIdNeverBecomesSunoCoverInput(): void {
  const murekaTaskId = "mureka-task-xyz";
  const personal = resolveAlbumCoverStrategy({
    musicProvider: "mureka",
    providerTaskId: murekaTaskId,
  });
  const standard = resolveAlbumCoverStrategy({
    musicProvider: "mureka",
    providerTaskId: murekaTaskId,
  });

  assert.equal(personal.kind, "unavailable");
  assert.equal(standard.kind, "unavailable");
  if (personal.kind === "unavailable") {
    assert.equal(personal.reason, "non_suno_music_provider");
  }
  // Invariant: strategy must not expose murekaTaskId as a Suno music task id.
  assert.equal("sunoMusicTaskId" in personal, false);
  assert.equal(isAlbumCoverVariantsAvailable("mureka"), false);
}

function testMissingSunoTaskIdUnavailable(): void {
  const strategy = resolveAlbumCoverStrategy({
    musicProvider: "sunoapi",
    providerTaskId: "  ",
  });
  assert.equal(strategy.kind, "unavailable");
  if (strategy.kind === "unavailable") {
    assert.equal(strategy.reason, "missing_suno_task_id");
  }
}

testSunoWithTaskIdUsesSunoCover();
testMurekaTaskIdNeverBecomesSunoCoverInput();
testMissingSunoTaskIdUnavailable();
console.log("album-cover-strategy.test.ts: ok");

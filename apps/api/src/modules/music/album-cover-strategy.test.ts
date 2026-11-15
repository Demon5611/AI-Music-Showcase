/**
 * Provider-aware album cover strategy contract tests.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/album-cover-strategy.test.ts
 */
import assert from "node:assert/strict";
import {
  isAlbumCoverVariantsAvailable,
  resolveAlbumCoverStrategy,
} from "./album-cover-strategy.js";

function testLegacyengineWithTaskIdUsesLegacyengineCover(): void {
  const strategy = resolveAlbumCoverStrategy({
    musicProvider: "legacyengineapi",
    providerTaskId: "legacyengine-music-task-1",
  });

  assert.equal(strategy.kind, "legacyengine_music_task");
  if (strategy.kind === "legacyengine_music_task") {
    assert.equal(strategy.legacyengineMusicTaskId, "legacyengine-music-task-1");
  }
  assert.equal(isAlbumCoverVariantsAvailable("legacyengineapi"), true);
}

function testAudioengineTaskIdNeverBecomesLegacyengineCoverInput(): void {
  const audioengineTaskId = "audioengine-task-xyz";
  const personal = resolveAlbumCoverStrategy({
    musicProvider: "audioengine",
    providerTaskId: audioengineTaskId,
  });
  const standard = resolveAlbumCoverStrategy({
    musicProvider: "audioengine",
    providerTaskId: audioengineTaskId,
  });

  assert.equal(personal.kind, "unavailable");
  assert.equal(standard.kind, "unavailable");
  if (personal.kind === "unavailable") {
    assert.equal(personal.reason, "non_legacyengine_music_provider");
  }
  // Invariant: strategy must not expose audioengineTaskId as a Legacyengine music task id.
  assert.equal("legacyengineMusicTaskId" in personal, false);
  assert.equal(isAlbumCoverVariantsAvailable("audioengine"), false);
}

function testMissingLegacyengineTaskIdUnavailable(): void {
  const strategy = resolveAlbumCoverStrategy({
    musicProvider: "legacyengineapi",
    providerTaskId: "  ",
  });
  assert.equal(strategy.kind, "unavailable");
  if (strategy.kind === "unavailable") {
    assert.equal(strategy.reason, "missing_legacyengine_task_id");
  }
}

testLegacyengineWithTaskIdUsesLegacyengineCover();
testAudioengineTaskIdNeverBecomesLegacyengineCoverInput();
testMissingLegacyengineTaskIdUnavailable();
console.log("album-cover-strategy.test.ts: ok");

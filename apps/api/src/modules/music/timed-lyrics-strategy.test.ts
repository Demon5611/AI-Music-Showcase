/**
 * Provider-aware timed lyrics strategy contract.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/timed-lyrics-strategy.test.ts
 */
import assert from "node:assert/strict";
import { resolveTimedLyricsStrategy } from "./timed-lyrics-strategy.js";

function testLegacyengineTrackUsesLegacyengineIds(): void {
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "legacyengineapi",
    providerTaskId: "legacyengine-task-1",
    providerAudioId: "legacyengine-audio-1",
  });

  assert.equal(strategy.kind, "legacyengine_timestamped");
  if (strategy.kind === "legacyengine_timestamped") {
    assert.equal(strategy.legacyengineTaskId, "legacyengine-task-1");
    assert.equal(strategy.legacyengineAudioId, "legacyengine-audio-1");
  }
}

function testDefaultProviderDoesNotAffectLegacyengineTrack(): void {
  // Invariant: even when MUSIC_DEFAULT_PROVIDER=audioengine, strategy uses track provider.
  const previous = process.env.MUSIC_DEFAULT_PROVIDER;
  process.env.MUSIC_DEFAULT_PROVIDER = "audioengine";

  try {
    const strategy = resolveTimedLyricsStrategy({
      musicProvider: "legacyengineapi",
      providerTaskId: "legacyengine-task-ge",
      providerAudioId: "legacyengine-audio-ge",
    });

    assert.equal(strategy.kind, "legacyengine_timestamped");
    if (strategy.kind === "legacyengine_timestamped") {
      assert.equal(strategy.legacyengineTaskId, "legacyengine-task-ge");
      assert.equal(strategy.legacyengineAudioId, "legacyengine-audio-ge");
    }
  } finally {
    if (previous === undefined) {
      delete process.env.MUSIC_DEFAULT_PROVIDER;
    } else {
      process.env.MUSIC_DEFAULT_PROVIDER = previous;
    }
  }
}

function testPersonalVoiceIrrelevant(): void {
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "legacyengineapi",
    providerTaskId: "legacyengine-task-2",
    providerAudioId: "legacyengine-audio-2",
  });
  assert.equal(strategy.kind, "legacyengine_timestamped");
  // Strategy input has no usePersonalVoice / VoiceProfile — by design.
  assert.equal("usePersonalVoice" in strategy, false);
}

function testAudioengineNeverRoutesToLegacyengineTimestamped(): void {
  const audioengineTaskId = "audioengine-task-xyz";
  const audioengineAudioId = "audioengine-choice-1";
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "audioengine",
    providerTaskId: audioengineTaskId,
    providerAudioId: audioengineAudioId,
  });

  assert.equal(strategy.kind, "unavailable");
  if (strategy.kind === "unavailable") {
    assert.equal(strategy.reason, "non_legacyengine_music_provider");
  }
  assert.equal("legacyengineTaskId" in strategy, false);
  assert.equal("legacyengineAudioId" in strategy, false);
}

function testMissingAudioIdUnavailable(): void {
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "legacyengineapi",
    providerTaskId: "legacyengine-task-3",
    providerAudioId: "  ",
  });
  assert.equal(strategy.kind, "unavailable");
  if (strategy.kind === "unavailable") {
    assert.equal(strategy.reason, "missing_legacyengine_audio_id");
  }
}

function testMissingTaskIdUnavailable(): void {
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "legacyengineapi",
    providerTaskId: null,
    providerAudioId: "legacyengine-audio-3",
  });
  assert.equal(strategy.kind, "unavailable");
  if (strategy.kind === "unavailable") {
    assert.equal(strategy.reason, "missing_legacyengine_task_id");
  }
}

function testGeorgianNotLanguageGated(): void {
  // No language field on strategy — Georgian lyrics are not rejected here.
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "legacyengineapi",
    providerTaskId: "dc2343ad6b75e428f8271ea031da8b14",
    providerAudioId: "81acf302-ac49-47bd-ab8c-5e9e70434f46",
  });
  assert.equal(strategy.kind, "legacyengine_timestamped");
}

testLegacyengineTrackUsesLegacyengineIds();
testDefaultProviderDoesNotAffectLegacyengineTrack();
testPersonalVoiceIrrelevant();
testAudioengineNeverRoutesToLegacyengineTimestamped();
testMissingAudioIdUnavailable();
testMissingTaskIdUnavailable();
testGeorgianNotLanguageGated();
console.log("timed-lyrics-strategy.test.ts: ok");

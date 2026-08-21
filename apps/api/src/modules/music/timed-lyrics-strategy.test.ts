/**
 * Provider-aware timed lyrics strategy contract.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/timed-lyrics-strategy.test.ts
 */
import assert from "node:assert/strict";
import { resolveTimedLyricsStrategy } from "./timed-lyrics-strategy.js";

function testSunoTrackUsesSunoIds(): void {
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "sunoapi",
    providerTaskId: "suno-task-1",
    providerAudioId: "suno-audio-1",
  });

  assert.equal(strategy.kind, "suno_timestamped");
  if (strategy.kind === "suno_timestamped") {
    assert.equal(strategy.sunoTaskId, "suno-task-1");
    assert.equal(strategy.sunoAudioId, "suno-audio-1");
  }
}

function testDefaultProviderDoesNotAffectSunoTrack(): void {
  // Invariant: even when MUSIC_DEFAULT_PROVIDER=mureka, strategy uses track provider.
  const previous = process.env.MUSIC_DEFAULT_PROVIDER;
  process.env.MUSIC_DEFAULT_PROVIDER = "mureka";

  try {
    const strategy = resolveTimedLyricsStrategy({
      musicProvider: "sunoapi",
      providerTaskId: "suno-task-ge",
      providerAudioId: "suno-audio-ge",
    });

    assert.equal(strategy.kind, "suno_timestamped");
    if (strategy.kind === "suno_timestamped") {
      assert.equal(strategy.sunoTaskId, "suno-task-ge");
      assert.equal(strategy.sunoAudioId, "suno-audio-ge");
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
    musicProvider: "sunoapi",
    providerTaskId: "suno-task-2",
    providerAudioId: "suno-audio-2",
  });
  assert.equal(strategy.kind, "suno_timestamped");
  // Strategy input has no usePersonalVoice / VoiceProfile — by design.
  assert.equal("usePersonalVoice" in strategy, false);
}

function testMurekaNeverRoutesToSunoTimestamped(): void {
  const murekaTaskId = "mureka-task-xyz";
  const murekaAudioId = "mureka-choice-1";
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "mureka",
    providerTaskId: murekaTaskId,
    providerAudioId: murekaAudioId,
  });

  assert.equal(strategy.kind, "unavailable");
  if (strategy.kind === "unavailable") {
    assert.equal(strategy.reason, "non_suno_music_provider");
  }
  assert.equal("sunoTaskId" in strategy, false);
  assert.equal("sunoAudioId" in strategy, false);
}

function testMissingAudioIdUnavailable(): void {
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "sunoapi",
    providerTaskId: "suno-task-3",
    providerAudioId: "  ",
  });
  assert.equal(strategy.kind, "unavailable");
  if (strategy.kind === "unavailable") {
    assert.equal(strategy.reason, "missing_suno_audio_id");
  }
}

function testMissingTaskIdUnavailable(): void {
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "sunoapi",
    providerTaskId: null,
    providerAudioId: "suno-audio-3",
  });
  assert.equal(strategy.kind, "unavailable");
  if (strategy.kind === "unavailable") {
    assert.equal(strategy.reason, "missing_suno_task_id");
  }
}

function testGeorgianNotLanguageGated(): void {
  // No language field on strategy — Georgian lyrics are not rejected here.
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "sunoapi",
    providerTaskId: "dc2343ad6b75e428f8271ea031da8b14",
    providerAudioId: "81acf302-ac49-47bd-ab8c-5e9e70434f46",
  });
  assert.equal(strategy.kind, "suno_timestamped");
}

testSunoTrackUsesSunoIds();
testDefaultProviderDoesNotAffectSunoTrack();
testPersonalVoiceIrrelevant();
testMurekaNeverRoutesToSunoTimestamped();
testMissingAudioIdUnavailable();
testMissingTaskIdUnavailable();
testGeorgianNotLanguageGated();
console.log("timed-lyrics-strategy.test.ts: ok");

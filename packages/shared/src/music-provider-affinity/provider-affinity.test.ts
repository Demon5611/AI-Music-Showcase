/**
 * Provider Affinity regression contract (A–I).
 * Run: pnpm --filter @ai-music/shared exec tsx src/music-provider-affinity/provider-affinity.test.ts
 */
import assert from "node:assert/strict";
import {
  musicProviderAffinityLogFields,
  resolveExistingMusicAssetProvider,
} from "./resolve-existing-music-asset-provider.js";

function testA_DefaultAudioengineStillResolvesLegacyengineTrack(): void {
  // MUSIC_DEFAULT_PROVIDER must not appear in this resolver.
  const previous = process.env.MUSIC_DEFAULT_PROVIDER;
  process.env.MUSIC_DEFAULT_PROVIDER = "audioengine";
  try {
    const result = resolveExistingMusicAssetProvider({
      generationProvider: "legacyengineapi",
      providerTaskId: "legacyengine-task",
      providerTrackId: "legacyengine-audio",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.provider, "legacyengineapi");
      assert.equal(result.providerTaskId, "legacyengine-task");
      assert.equal(result.providerTrackId, "legacyengine-audio");
    }
  } finally {
    if (previous === undefined) {
      delete process.env.MUSIC_DEFAULT_PROVIDER;
    } else {
      process.env.MUSIC_DEFAULT_PROVIDER = previous;
    }
  }
}

function testB_DefaultLegacyengineStillResolvesAudioengineTrack(): void {
  const previous = process.env.MUSIC_DEFAULT_PROVIDER;
  process.env.MUSIC_DEFAULT_PROVIDER = "legacyengineapi";
  try {
    const result = resolveExistingMusicAssetProvider({
      generationProvider: "audioengine",
      providerTaskId: "audioengine-task",
      providerTrackId: "audioengine-choice",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.provider, "audioengine");
      assert.equal(result.providerTaskId, "audioengine-task");
    }
  } finally {
    if (previous === undefined) {
      delete process.env.MUSIC_DEFAULT_PROVIDER;
    } else {
      process.env.MUSIC_DEFAULT_PROVIDER = previous;
    }
  }
}

function testC_MyVoiceIrrelevant(): void {
  const result = resolveExistingMusicAssetProvider({
    generationProvider: "legacyengineapi",
    providerTaskId: "t",
    providerTrackId: "a",
  });
  assert.equal(result.ok, true);
  assert.equal("usePersonalVoice" in result, false);
}

function testD_E_IdsStayWithResolvedProvider(): void {
  const legacyengine = resolveExistingMusicAssetProvider({
    generationProvider: "legacyengineapi",
    providerTaskId: "legacyengine-only-task",
    providerTrackId: "legacyengine-only-audio",
  });
  assert.equal(legacyengine.ok && legacyengine.provider === "legacyengineapi", true);

  const audioengine = resolveExistingMusicAssetProvider({
    generationProvider: "audioengine",
    providerTaskId: "audioengine-only-task",
    providerTrackId: "audioengine-only-choice",
  });
  assert.equal(audioengine.ok && audioengine.provider === "audioengine", true);
  // Callers must not pass audioengine ids into Legacyengine — affinity keeps them tagged audioengine.
  if (audioengine.ok) {
    assert.notEqual(audioengine.provider, "legacyengineapi");
  }
}

function testF_MismatchFailClosed(): void {
  const result = resolveExistingMusicAssetProvider({
    trackProvider: "legacyengineapi",
    generationProvider: "audioengine",
    providerTaskId: "x",
    providerTrackId: "y",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "MUSIC_PROVIDER_AFFINITY_MISMATCH");
  }
  const log = musicProviderAffinityLogFields(result, {
    trackId: "tr1",
    generationId: "g1",
  });
  assert.equal(log.affinityCode, "MUSIC_PROVIDER_AFFINITY_MISMATCH");
  assert.equal(log.trackId, "tr1");
  assert.equal(typeof log.trackProvider, "string");
}

function testG_LegacyNullTrackUsesGeneration(): void {
  const result = resolveExistingMusicAssetProvider({
    trackProvider: null,
    generationProvider: "legacyengineapi",
    providerTaskId: "legacyengine-task",
    providerTrackId: "legacyengine-audio",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.provider, "legacyengineapi");
    assert.equal(result.resolvedFrom, "generation");
  }
}

function testH_BothUnknownNoDefaultFallback(): void {
  const previous = process.env.MUSIC_DEFAULT_PROVIDER;
  process.env.MUSIC_DEFAULT_PROVIDER = "legacyengineapi";
  try {
    const result = resolveExistingMusicAssetProvider({
      trackProvider: null,
      generationProvider: "  ",
      songProvider: null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "MUSIC_PROVIDER_AFFINITY_UNKNOWN");
    }
  } finally {
    if (previous === undefined) {
      delete process.env.MUSIC_DEFAULT_PROVIDER;
    } else {
      process.env.MUSIC_DEFAULT_PROVIDER = previous;
    }
  }
}

function testI_SongConsistentWithGeneration(): void {
  const result = resolveExistingMusicAssetProvider({
    generationProvider: "legacyengineapi",
    songProvider: "legacyengineapi",
    providerTaskId: "t",
    providerTrackId: "a",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.resolvedFrom, "generation");
  }
}

function testUnknownVendorNoGuess(): void {
  const result = resolveExistingMusicAssetProvider({
    generationProvider: "alternateengine",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "MUSIC_PROVIDER_AFFINITY_UNKNOWN");
  }
}

testA_DefaultAudioengineStillResolvesLegacyengineTrack();
testB_DefaultLegacyengineStillResolvesAudioengineTrack();
testC_MyVoiceIrrelevant();
testD_E_IdsStayWithResolvedProvider();
testF_MismatchFailClosed();
testG_LegacyNullTrackUsesGeneration();
testH_BothUnknownNoDefaultFallback();
testI_SongConsistentWithGeneration();
testUnknownVendorNoGuess();
console.log("provider-affinity.test.ts: ok");

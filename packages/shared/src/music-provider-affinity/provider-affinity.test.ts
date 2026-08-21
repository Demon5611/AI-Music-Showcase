/**
 * Provider Affinity regression contract (A–I).
 * Run: pnpm --filter @ai-music/shared exec tsx src/music-provider-affinity/provider-affinity.test.ts
 */
import assert from "node:assert/strict";
import {
  musicProviderAffinityLogFields,
  resolveExistingMusicAssetProvider,
} from "./resolve-existing-music-asset-provider.js";

function testA_DefaultMurekaStillResolvesSunoTrack(): void {
  // MUSIC_DEFAULT_PROVIDER must not appear in this resolver.
  const previous = process.env.MUSIC_DEFAULT_PROVIDER;
  process.env.MUSIC_DEFAULT_PROVIDER = "mureka";
  try {
    const result = resolveExistingMusicAssetProvider({
      generationProvider: "sunoapi",
      providerTaskId: "suno-task",
      providerTrackId: "suno-audio",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.provider, "sunoapi");
      assert.equal(result.providerTaskId, "suno-task");
      assert.equal(result.providerTrackId, "suno-audio");
    }
  } finally {
    if (previous === undefined) {
      delete process.env.MUSIC_DEFAULT_PROVIDER;
    } else {
      process.env.MUSIC_DEFAULT_PROVIDER = previous;
    }
  }
}

function testB_DefaultSunoStillResolvesMurekaTrack(): void {
  const previous = process.env.MUSIC_DEFAULT_PROVIDER;
  process.env.MUSIC_DEFAULT_PROVIDER = "sunoapi";
  try {
    const result = resolveExistingMusicAssetProvider({
      generationProvider: "mureka",
      providerTaskId: "mureka-task",
      providerTrackId: "mureka-choice",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.provider, "mureka");
      assert.equal(result.providerTaskId, "mureka-task");
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
    generationProvider: "sunoapi",
    providerTaskId: "t",
    providerTrackId: "a",
  });
  assert.equal(result.ok, true);
  assert.equal("usePersonalVoice" in result, false);
}

function testD_E_IdsStayWithResolvedProvider(): void {
  const suno = resolveExistingMusicAssetProvider({
    generationProvider: "sunoapi",
    providerTaskId: "suno-only-task",
    providerTrackId: "suno-only-audio",
  });
  assert.equal(suno.ok && suno.provider === "sunoapi", true);

  const mureka = resolveExistingMusicAssetProvider({
    generationProvider: "mureka",
    providerTaskId: "mureka-only-task",
    providerTrackId: "mureka-only-choice",
  });
  assert.equal(mureka.ok && mureka.provider === "mureka", true);
  // Callers must not pass mureka ids into Suno — affinity keeps them tagged mureka.
  if (mureka.ok) {
    assert.notEqual(mureka.provider, "sunoapi");
  }
}

function testF_MismatchFailClosed(): void {
  const result = resolveExistingMusicAssetProvider({
    trackProvider: "sunoapi",
    generationProvider: "mureka",
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
    generationProvider: "sunoapi",
    providerTaskId: "suno-task",
    providerTrackId: "suno-audio",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.provider, "sunoapi");
    assert.equal(result.resolvedFrom, "generation");
  }
}

function testH_BothUnknownNoDefaultFallback(): void {
  const previous = process.env.MUSIC_DEFAULT_PROVIDER;
  process.env.MUSIC_DEFAULT_PROVIDER = "sunoapi";
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
    generationProvider: "sunoapi",
    songProvider: "sunoapi",
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
    generationProvider: "udio",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "MUSIC_PROVIDER_AFFINITY_UNKNOWN");
  }
}

testA_DefaultMurekaStillResolvesSunoTrack();
testB_DefaultSunoStillResolvesMurekaTrack();
testC_MyVoiceIrrelevant();
testD_E_IdsStayWithResolvedProvider();
testF_MismatchFailClosed();
testG_LegacyNullTrackUsesGeneration();
testH_BothUnknownNoDefaultFallback();
testI_SongConsistentWithGeneration();
testUnknownVendorNoGuess();
console.log("provider-affinity.test.ts: ok");

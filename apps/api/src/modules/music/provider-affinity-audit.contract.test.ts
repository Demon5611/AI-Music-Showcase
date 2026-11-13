/**
 * Provider Affinity audit contract — documents call-site expectations.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/provider-affinity-audit.contract.test.ts
 */
import assert from "node:assert/strict";
import { resolveExistingMusicAssetProvider } from "@ai-music/shared";
import { resolveAlbumCoverStrategy } from "./album-cover-strategy.js";
import { resolveTimedLyricsStrategy } from "./timed-lyrics-strategy.js";

type AffinityExpectation = {
  operation: string;
  existingAsset: boolean;
  usesProviderSpecificId: boolean;
  shouldUseAffinity: boolean;
  note: string;
};

const AUDIT: AffinityExpectation[] = [
  {
    operation: "timed-lyrics",
    existingAsset: true,
    usesProviderSpecificId: true,
    shouldUseAffinity: true,
    note: "Legacyengine taskId+audioId; Audioengine unavailable",
  },
  {
    operation: "album-cover",
    existingAsset: true,
    usesProviderSpecificId: true,
    shouldUseAffinity: true,
    note: "Legacyengine music taskId only",
  },
  {
    operation: "stem-separation (Legacyengine vocal-removal)",
    existingAsset: true,
    usesProviderSpecificId: true,
    shouldUseAffinity: true,
    note: "song.provider + explicit getProvider(id)",
  },
  {
    operation: "generation status poll",
    existingAsset: true,
    usesProviderSpecificId: true,
    shouldUseAffinity: true,
    note: "createMusicGenerationProvider(record.provider)",
  },
  {
    operation: "remix (upload-cover)",
    existingAsset: true,
    usesProviderSpecificId: false,
    shouldUseAffinity: false,
    note: "Creates NEW Legacyengine asset from reference audio URL",
  },
  {
    operation: "generateSong / lyrics",
    existingAsset: false,
    usesProviderSpecificId: false,
    shouldUseAffinity: false,
    note: "Creation-time routing",
  },
  {
    operation: "local editor / ffmpeg / WAV",
    existingAsset: true,
    usesProviderSpecificId: false,
    shouldUseAffinity: false,
    note: "Provider-neutral",
  },
  {
    operation: "MusicService.extendSong",
    existingAsset: true,
    usesProviderSpecificId: true,
    shouldUseAffinity: true,
    note: "Latent: still getProvider() default — no API route yet",
  },
];

function testAuditTableShape(): void {
  for (const row of AUDIT) {
    assert.equal(typeof row.operation, "string");
    assert.equal(typeof row.shouldUseAffinity, "boolean");
  }
  assert.ok(AUDIT.some((row) => row.operation === "timed-lyrics" && row.shouldUseAffinity));
  assert.ok(AUDIT.some((row) => row.operation.includes("local editor") && !row.shouldUseAffinity));
}

function testLegacyengineTrackOpsIgnoreDefaultAudioengine(): void {
  const previous = process.env.MUSIC_DEFAULT_PROVIDER;
  process.env.MUSIC_DEFAULT_PROVIDER = "audioengine";
  try {
    const timed = resolveTimedLyricsStrategy({
      musicProvider: "legacyengineapi",
      providerTaskId: "legacyengine-task",
      providerAudioId: "legacyengine-audio",
    });
    assert.equal(timed.kind, "legacyengine_timestamped");

    const cover = resolveAlbumCoverStrategy({
      musicProvider: "legacyengineapi",
      providerTaskId: "legacyengine-task",
    });
    assert.equal(cover.kind, "legacyengine_music_task");
  } finally {
    if (previous === undefined) {
      delete process.env.MUSIC_DEFAULT_PROVIDER;
    } else {
      process.env.MUSIC_DEFAULT_PROVIDER = previous;
    }
  }
}

function testAudioengineNeverSilentLegacyengineFallback(): void {
  const previous = process.env.MUSIC_DEFAULT_PROVIDER;
  process.env.MUSIC_DEFAULT_PROVIDER = "legacyengineapi";
  try {
    const timed = resolveTimedLyricsStrategy({
      musicProvider: "audioengine",
      providerTaskId: "audioengine-task",
      providerAudioId: "audioengine-choice",
    });
    assert.equal(timed.kind, "unavailable");

    const cover = resolveAlbumCoverStrategy({
      musicProvider: "audioengine",
      providerTaskId: "audioengine-task",
    });
    assert.equal(cover.kind, "unavailable");
  } finally {
    if (previous === undefined) {
      delete process.env.MUSIC_DEFAULT_PROVIDER;
    } else {
      process.env.MUSIC_DEFAULT_PROVIDER = previous;
    }
  }
}

function testMismatchNoProviderGuess(): void {
  const affinity = resolveExistingMusicAssetProvider({
    trackProvider: "legacyengineapi",
    generationProvider: "audioengine",
  });
  assert.equal(affinity.ok, false);
  if (!affinity.ok) {
    assert.equal(affinity.code, "MUSIC_PROVIDER_AFFINITY_MISMATCH");
  }
}

testAuditTableShape();
testLegacyengineTrackOpsIgnoreDefaultAudioengine();
testAudioengineNeverSilentLegacyengineFallback();
testMismatchNoProviderGuess();
console.log("provider-affinity-audit.contract.test.ts: ok");

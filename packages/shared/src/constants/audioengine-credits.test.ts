import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUDIOENGINE_CREDIT_COSTS,
  AUDIOENGINE_CREDIT_COST_UNITS,
  buildAudioengineMusicRefundKey,
  buildAudioengineMusicSpendKey,
  buildAudioengineVoiceProfileSpendKey,
} from "./audioengine-credits.js";
import { CREDIT_UNIT_SCALE } from "./credits-economy.js";
import { resolveAudioengineFeatureFlags } from "./audioengine-flags.js";

describe("AUDIOENGINE_CREDIT_COSTS", () => {
  it("keeps product credits independent from provider USD", () => {
    assert.equal(AUDIOENGINE_CREDIT_COSTS.createPersonalVoice, 1_200);
    assert.equal(AUDIOENGINE_CREDIT_COSTS.generateSongs, 24);
    assert.equal(
      AUDIOENGINE_CREDIT_COST_UNITS.createPersonalVoice,
      1_200 * CREDIT_UNIT_SCALE,
    );
    assert.equal(AUDIOENGINE_CREDIT_COST_UNITS.generateSongs, 24 * CREDIT_UNIT_SCALE);
  });

  it("builds stable ledger keys", () => {
    assert.equal(
      buildAudioengineVoiceProfileSpendKey("vp1"),
      "voice-profile:vp1:audioengine:v1:spend",
    );
    assert.equal(
      buildAudioengineMusicSpendKey("g1"),
      "music-generation:g1:audioengine:v1:spend",
    );
    assert.equal(
      buildAudioengineMusicRefundKey("g1"),
      "music-generation:g1:audioengine:v1:refund",
    );
  });
});

describe("resolveAudioengineFeatureFlags", () => {
  it("defaults all enable flags to false (production-safe)", () => {
    const flags = resolveAudioengineFeatureFlags({});
    assert.equal(flags.enabled, false);
    assert.equal(flags.personalVoiceEnabled, false);
    assert.equal(flags.productionRolloutEnabled, false);
    assert.equal(flags.wavPersistEnabled, false);
    assert.equal(flags.flacPersistEnabled, false);
    assert.equal(flags.legacyengineFallbackEnabled, false);
    assert.equal(flags.mp3PersistEnabled, true);
    assert.equal(flags.model, "audioengine-9");
    assert.equal(flags.songCount, 1);
    assert.equal(flags.providerConcurrency, 1);
    assert.equal(flags.vocalCloneConcurrency, 1);
  });

  it("falls back to 1 output when AUDIOENGINE_SONG_COUNT is set (deprecated / ignored)", () => {
    assert.equal(resolveAudioengineFeatureFlags({ AUDIOENGINE_SONG_COUNT: "0" }).songCount, 1);
    assert.equal(resolveAudioengineFeatureFlags({ AUDIOENGINE_SONG_COUNT: "4" }).songCount, 1);
    assert.equal(resolveAudioengineFeatureFlags({ AUDIOENGINE_SONG_COUNT: "-1" }).songCount, 1);
    assert.equal(resolveAudioengineFeatureFlags({ AUDIOENGINE_SONG_COUNT: "1.5" }).songCount, 1);
    assert.equal(resolveAudioengineFeatureFlags({ AUDIOENGINE_SONG_COUNT: "2" }).songCount, 1);
    assert.equal(resolveAudioengineFeatureFlags({ AUDIOENGINE_SONG_COUNT: "3" }).songCount, 1);
    assert.equal(resolveAudioengineFeatureFlags({}).songCount, 1);
  });
});

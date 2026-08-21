import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MUREKA_CREDIT_COSTS,
  MUREKA_CREDIT_COST_UNITS,
  buildMurekaMusicRefundKey,
  buildMurekaMusicSpendKey,
  buildMurekaVoiceProfileSpendKey,
} from "./mureka-credits.js";
import { CREDIT_UNIT_SCALE } from "./credits-economy.js";
import { resolveMurekaFeatureFlags } from "./mureka-flags.js";

describe("MUREKA_CREDIT_COSTS", () => {
  it("keeps product credits independent from provider USD", () => {
    assert.equal(MUREKA_CREDIT_COSTS.createPersonalVoice, 1_200);
    assert.equal(MUREKA_CREDIT_COSTS.generateSongs, 24);
    assert.equal(
      MUREKA_CREDIT_COST_UNITS.createPersonalVoice,
      1_200 * CREDIT_UNIT_SCALE,
    );
    assert.equal(MUREKA_CREDIT_COST_UNITS.generateSongs, 24 * CREDIT_UNIT_SCALE);
  });

  it("builds stable ledger keys", () => {
    assert.equal(
      buildMurekaVoiceProfileSpendKey("vp1"),
      "voice-profile:vp1:mureka:v1:spend",
    );
    assert.equal(
      buildMurekaMusicSpendKey("g1"),
      "music-generation:g1:mureka:v1:spend",
    );
    assert.equal(
      buildMurekaMusicRefundKey("g1"),
      "music-generation:g1:mureka:v1:refund",
    );
  });
});

describe("resolveMurekaFeatureFlags", () => {
  it("defaults all enable flags to false (production-safe)", () => {
    const flags = resolveMurekaFeatureFlags({});
    assert.equal(flags.enabled, false);
    assert.equal(flags.personalVoiceEnabled, false);
    assert.equal(flags.productionRolloutEnabled, false);
    assert.equal(flags.wavPersistEnabled, false);
    assert.equal(flags.flacPersistEnabled, false);
    assert.equal(flags.sunoFallbackEnabled, false);
    assert.equal(flags.mp3PersistEnabled, true);
    assert.equal(flags.model, "mureka-9");
    assert.equal(flags.songCount, 1);
    assert.equal(flags.providerConcurrency, 1);
    assert.equal(flags.vocalCloneConcurrency, 1);
  });

  it("falls back to 1 output when MUREKA_SONG_COUNT is set (deprecated / ignored)", () => {
    assert.equal(resolveMurekaFeatureFlags({ MUREKA_SONG_COUNT: "0" }).songCount, 1);
    assert.equal(resolveMurekaFeatureFlags({ MUREKA_SONG_COUNT: "4" }).songCount, 1);
    assert.equal(resolveMurekaFeatureFlags({ MUREKA_SONG_COUNT: "-1" }).songCount, 1);
    assert.equal(resolveMurekaFeatureFlags({ MUREKA_SONG_COUNT: "1.5" }).songCount, 1);
    assert.equal(resolveMurekaFeatureFlags({ MUREKA_SONG_COUNT: "2" }).songCount, 1);
    assert.equal(resolveMurekaFeatureFlags({ MUREKA_SONG_COUNT: "3" }).songCount, 1);
    assert.equal(resolveMurekaFeatureFlags({}).songCount, 1);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPERATION_COST_UNITS } from "./credits-economy.js";
import { AUDIOENGINE_CREDIT_COST_UNITS } from "./audioengine-credits.js";
import {
  canAffordMusicGenerate,
  resolveMusicGenerateCostUnits,
} from "./music-generate-cost.js";

describe("resolveMusicGenerateCostUnits", () => {
  it("uses Audioengine product credit independently of provider output count", () => {
    assert.equal(
      resolveMusicGenerateCostUnits({ usePersonalVoice: true }),
      AUDIOENGINE_CREDIT_COST_UNITS.generateSongs,
    );
    assert.equal(
      resolveMusicGenerateCostUnits({ providerId: "audioengine" }),
      AUDIOENGINE_CREDIT_COST_UNITS.generateSongs,
    );
    assert.equal(AUDIOENGINE_CREDIT_COST_UNITS.generateSongs, 24_000);
  });

  it("uses Legacyengine legacy cost otherwise", () => {
    assert.equal(resolveMusicGenerateCostUnits({}), OPERATION_COST_UNITS.generateTrack);
    assert.equal(
      resolveMusicGenerateCostUnits({ providerId: "legacyengineapi" }),
      OPERATION_COST_UNITS.generateTrack,
    );
    assert.equal(OPERATION_COST_UNITS.generateTrack, 15_000);
  });

  it("gates affordability by resolved cost", () => {
    assert.equal(canAffordMusicGenerate(15, { providerId: "legacyengineapi" }), true);
    assert.equal(canAffordMusicGenerate(14, { providerId: "legacyengineapi" }), false);
    assert.equal(canAffordMusicGenerate(12, { usePersonalVoice: true }), false);
    assert.equal(canAffordMusicGenerate(24, { usePersonalVoice: true }), true);
  });
});

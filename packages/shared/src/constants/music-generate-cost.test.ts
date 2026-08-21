import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OPERATION_COST_UNITS } from "./credits-economy.js";
import { MUREKA_CREDIT_COST_UNITS } from "./mureka-credits.js";
import {
  canAffordMusicGenerate,
  resolveMusicGenerateCostUnits,
} from "./music-generate-cost.js";

describe("resolveMusicGenerateCostUnits", () => {
  it("uses Mureka product credit independently of provider output count", () => {
    assert.equal(
      resolveMusicGenerateCostUnits({ usePersonalVoice: true }),
      MUREKA_CREDIT_COST_UNITS.generateSongs,
    );
    assert.equal(
      resolveMusicGenerateCostUnits({ providerId: "mureka" }),
      MUREKA_CREDIT_COST_UNITS.generateSongs,
    );
    assert.equal(MUREKA_CREDIT_COST_UNITS.generateSongs, 24_000);
  });

  it("uses Suno legacy cost otherwise", () => {
    assert.equal(resolveMusicGenerateCostUnits({}), OPERATION_COST_UNITS.generateTrack);
    assert.equal(
      resolveMusicGenerateCostUnits({ providerId: "sunoapi" }),
      OPERATION_COST_UNITS.generateTrack,
    );
    assert.equal(OPERATION_COST_UNITS.generateTrack, 15_000);
  });

  it("gates affordability by resolved cost", () => {
    assert.equal(canAffordMusicGenerate(15, { providerId: "sunoapi" }), true);
    assert.equal(canAffordMusicGenerate(14, { providerId: "sunoapi" }), false);
    assert.equal(canAffordMusicGenerate(12, { usePersonalVoice: true }), false);
    assert.equal(canAffordMusicGenerate(24, { usePersonalVoice: true }), true);
  });
});

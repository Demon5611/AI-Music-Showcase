import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPERATION_COST_CREDITS,
  OPERATION_COST_UNITS,
  STANDARD_MUSIC_GENERATION_EXAMPLE_CREDITS,
  canAffordPersonalVoiceCreation,
} from "./credits-economy.js";
import { buildLyricsRefundKey, buildLyricsSpendKey } from "./lyrics-credits.js";
import {
  computePersonalVoiceGenerationExample,
  computeStandardMusicGenerationExample,
  getPackagePersonalVoiceExample,
  getPackageStandardExample,
} from "./pricing-examples.js";

describe("credits economy SoT", () => {
  it("matches Pricing Model v1 display credits", () => {
    assert.equal(OPERATION_COST_CREDITS.generateText, 1);
    assert.equal(OPERATION_COST_CREDITS.generateTrack, 15);
    assert.equal(OPERATION_COST_CREDITS.generateSongs, 24);
    assert.equal(OPERATION_COST_CREDITS.createPersonalVoice, 1200);
    assert.equal(OPERATION_COST_CREDITS.stemSeparation, 12);
    assert.equal(OPERATION_COST_CREDITS.karaokeLyrics, 1);
    assert.equal(OPERATION_COST_CREDITS.wavExport, 0);
    assert.equal(OPERATION_COST_CREDITS.albumCover, 0);
    assert.equal(OPERATION_COST_CREDITS.manualEditorOperation, 0);
  });

  it("maps display credits to ledger units", () => {
    assert.equal(OPERATION_COST_UNITS.generateText, 1_000);
    assert.equal(OPERATION_COST_UNITS.generateTrack, 15_000);
    assert.equal(OPERATION_COST_UNITS.generateSongs, 24_000);
    assert.equal(OPERATION_COST_UNITS.createPersonalVoice, 1_200_000);
    assert.equal(OPERATION_COST_UNITS.stemSeparation, 12_000);
    assert.equal(OPERATION_COST_UNITS.karaokeLyrics, 1_000);
    assert.equal(OPERATION_COST_UNITS.wavExport, 0);
  });

  it("gates Personal AI Voice by balance only (Starter 1500 can create)", () => {
    assert.equal(canAffordPersonalVoiceCreation(1199), false);
    assert.equal(canAffordPersonalVoiceCreation(1200), true);
    assert.equal(canAffordPersonalVoiceCreation(1500), true);
  });

  it("builds stable lyrics ledger keys", () => {
    assert.equal(buildLyricsSpendKey("req1"), "lyrics:req1:spend");
    assert.equal(buildLyricsRefundKey("req1"), "lyrics:req1:refund");
  });
});

describe("pricing examples", () => {
  it("uses standard lyrics + generation flow of 25 credits", () => {
    assert.equal(STANDARD_MUSIC_GENERATION_EXAMPLE_CREDITS, 25);
    assert.deepEqual(computeStandardMusicGenerationExample(50), {
      creditsPerGeneration: 25,
      generations: 2,
      variants: 2,
    });
    assert.deepEqual(getPackageStandardExample("starter"), {
      creditsPerGeneration: 25,
      generations: 20,
      variants: 20,
    });
  });

  it("derives Creator / Studio personal voice examples", () => {
    const creator = getPackagePersonalVoiceExample("creator");
    assert.equal(creator.personalVoiceCreations, 1);
    assert.equal(creator.generationsAfterVoice, 32);
    assert.equal(creator.variantsAfterVoice, 32);
    assert.equal(creator.generationsWithoutNewVoice, 80);

    const studio = getPackagePersonalVoiceExample("studio");
    assert.equal(studio.generationsAfterVoice, 272);
    assert.equal(studio.variantsAfterVoice, 272);
    assert.equal(studio.generationsWithoutNewVoice, 320);

    const starterVoice = computePersonalVoiceGenerationExample(500);
    assert.equal(starterVoice.personalVoiceCreations, 0);
    assert.equal(starterVoice.generationsWithoutNewVoice, 20);
  });
});

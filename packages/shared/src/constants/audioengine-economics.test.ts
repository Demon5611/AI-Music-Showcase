import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AUDIOENGINE_CREDIT_COSTS } from "./audioengine-credits.js";
import {
  AUDIOENGINE_DEFAULT_VARIANT_COUNT,
  AUDIOENGINE_ECONOMICS,
  AUDIOENGINE_LYRICS_TO_SONG_USD_MICROS_PER_OUTPUT,
  AUDIOENGINE_OUTPUT_COUNT,
  estimateAudioengineLyricsToSongUsdMicros,
  formatUsdFromMicros,
  parseAudioengineVariantCount,
  resolveAudioengineVariantCount,
} from "./audioengine-economics.js";

describe("Audioengine economics showcase placeholders", () => {
  it("locks product output count to 1", () => {
    assert.equal(AUDIOENGINE_OUTPUT_COUNT, 1);
    assert.equal(AUDIOENGINE_DEFAULT_VARIANT_COUNT, 1);
    assert.equal(AUDIOENGINE_ECONOMICS.defaultVariantCount, 1);
    assert.equal(AUDIOENGINE_ECONOMICS.outputCount, 1);
    assert.equal(resolveAudioengineVariantCount(undefined), 1);
  });

  it("uses an obviously fake per-output micros placeholder", () => {
    assert.equal(AUDIOENGINE_LYRICS_TO_SONG_USD_MICROS_PER_OUTPUT, 1);
    assert.equal(estimateAudioengineLyricsToSongUsdMicros(1), 1);
    assert.equal(estimateAudioengineLyricsToSongUsdMicros(AUDIOENGINE_OUTPUT_COUNT), 1);
    assert.equal(estimateAudioengineLyricsToSongUsdMicros(2), 2);
    assert.equal(estimateAudioengineLyricsToSongUsdMicros(3), 3);
    assert.equal(formatUsdFromMicros(estimateAudioengineLyricsToSongUsdMicros(1)), "0.000");
  });

  it("rejects invalid variant counts", () => {
    assert.equal(parseAudioengineVariantCount(0).ok, false);
    assert.equal(parseAudioengineVariantCount(4).ok, false);
    assert.equal(parseAudioengineVariantCount(-1).ok, false);
    assert.equal(parseAudioengineVariantCount(1.5).ok, false);
    assert.equal(parseAudioengineVariantCount("1").ok, false);
    assert.equal(parseAudioengineVariantCount(null).ok, false);
    assert.throws(() => estimateAudioengineLyricsToSongUsdMicros(0));
    assert.throws(() => estimateAudioengineLyricsToSongUsdMicros(4));
    assert.throws(() => estimateAudioengineLyricsToSongUsdMicros(-1));
    assert.throws(() => estimateAudioengineLyricsToSongUsdMicros(1.5));
  });

  it("does not drive user credit charges", () => {
    assert.equal(AUDIOENGINE_CREDIT_COSTS.generateSongs, 24);
    assert.notEqual(
      AUDIOENGINE_CREDIT_COSTS.generateSongs,
      Number(formatUsdFromMicros(estimateAudioengineLyricsToSongUsdMicros(1))),
    );
    assert.equal(AUDIOENGINE_ECONOMICS.vocalCloneCreate.status, "unverified");
    assert.equal(AUDIOENGINE_ECONOMICS.vocalCloneCreate.usedInRuntimeBilling, false);
  });
});

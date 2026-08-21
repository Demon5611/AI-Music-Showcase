import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MUREKA_CREDIT_COSTS } from "./mureka-credits.js";
import {
  MUREKA_DEFAULT_VARIANT_COUNT,
  MUREKA_ECONOMICS,
  MUREKA_LYRICS_TO_SONG_USD_MICROS_PER_OUTPUT,
  MUREKA_OUTPUT_COUNT,
  estimateMurekaLyricsToSongUsdMicros,
  formatUsdFromMicros,
  parseMurekaVariantCount,
  resolveMurekaVariantCount,
} from "./mureka-economics.js";

describe("Mureka economics showcase placeholders", () => {
  it("locks product output count to 1", () => {
    assert.equal(MUREKA_OUTPUT_COUNT, 1);
    assert.equal(MUREKA_DEFAULT_VARIANT_COUNT, 1);
    assert.equal(MUREKA_ECONOMICS.defaultVariantCount, 1);
    assert.equal(MUREKA_ECONOMICS.outputCount, 1);
    assert.equal(resolveMurekaVariantCount(undefined), 1);
  });

  it("uses an obviously fake per-output micros placeholder", () => {
    assert.equal(MUREKA_LYRICS_TO_SONG_USD_MICROS_PER_OUTPUT, 1);
    assert.equal(estimateMurekaLyricsToSongUsdMicros(1), 1);
    assert.equal(estimateMurekaLyricsToSongUsdMicros(MUREKA_OUTPUT_COUNT), 1);
    assert.equal(estimateMurekaLyricsToSongUsdMicros(2), 2);
    assert.equal(estimateMurekaLyricsToSongUsdMicros(3), 3);
    assert.equal(formatUsdFromMicros(estimateMurekaLyricsToSongUsdMicros(1)), "0.000");
  });

  it("rejects invalid variant counts", () => {
    assert.equal(parseMurekaVariantCount(0).ok, false);
    assert.equal(parseMurekaVariantCount(4).ok, false);
    assert.equal(parseMurekaVariantCount(-1).ok, false);
    assert.equal(parseMurekaVariantCount(1.5).ok, false);
    assert.equal(parseMurekaVariantCount("1").ok, false);
    assert.equal(parseMurekaVariantCount(null).ok, false);
    assert.throws(() => estimateMurekaLyricsToSongUsdMicros(0));
    assert.throws(() => estimateMurekaLyricsToSongUsdMicros(4));
    assert.throws(() => estimateMurekaLyricsToSongUsdMicros(-1));
    assert.throws(() => estimateMurekaLyricsToSongUsdMicros(1.5));
  });

  it("does not drive user credit charges", () => {
    assert.equal(MUREKA_CREDIT_COSTS.generateSongs, 24);
    assert.notEqual(
      MUREKA_CREDIT_COSTS.generateSongs,
      Number(formatUsdFromMicros(estimateMurekaLyricsToSongUsdMicros(1))),
    );
    assert.equal(MUREKA_ECONOMICS.vocalCloneCreate.status, "unverified");
    assert.equal(MUREKA_ECONOMICS.vocalCloneCreate.usedInRuntimeBilling, false);
  });
});

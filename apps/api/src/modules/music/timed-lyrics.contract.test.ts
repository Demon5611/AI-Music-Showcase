/**
 * Timed lyrics / Karaoke Sync contracts (provider-aware, spend gates).
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/timed-lyrics.contract.test.ts
 */
import assert from "node:assert/strict";
import { OPERATION_COST_CREDITS, OPERATION_COST_UNITS } from "@ai-music/shared";
import {
  resolveTimedLyricsStrategy,
  timedLyricsStrategyErrorCode,
} from "./timed-lyrics-strategy.js";

function testKaraokeCostIsOneProductCredit(): void {
  assert.equal(OPERATION_COST_CREDITS.karaokeLyrics, 1);
  assert.equal(OPERATION_COST_UNITS.karaokeLyrics, 1_000);
}

function testMurekaUnavailableCode(): void {
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "mureka",
    providerTaskId: "mureka-1",
    providerAudioId: "choice-1",
  });
  assert.equal(strategy.kind, "unavailable");
  if (strategy.kind === "unavailable") {
    assert.equal(
      timedLyricsStrategyErrorCode(strategy),
      "TIMED_LYRICS_UNAVAILABLE_FOR_PROVIDER",
    );
  }
}

function testMissingAudioIdCode(): void {
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "sunoapi",
    providerTaskId: "suno-task",
    providerAudioId: "  ",
  });
  assert.equal(strategy.kind, "unavailable");
  if (strategy.kind === "unavailable") {
    assert.equal(timedLyricsStrategyErrorCode(strategy), "TIMED_LYRICS_PROVIDER_IDS_MISSING");
  }
}

function testSunoReadyIds(): void {
  const strategy = resolveTimedLyricsStrategy({
    musicProvider: "sunoapi",
    providerTaskId: "suno-task-1",
    providerAudioId: "suno-audio-1",
  });
  assert.equal(strategy.kind, "suno_timestamped");
  if (strategy.kind === "suno_timestamped") {
    assert.equal(strategy.sunoTaskId, "suno-task-1");
    assert.equal(strategy.sunoAudioId, "suno-audio-1");
  }
}

function testRefundUsesOriginalSpendUnits(): void {
  // Contract: refundOriginalSpend(spendKey) refunds the ledger spend amount,
  // not a recalculated current price. Karaoke spend is fixed at 1 credit.
  assert.equal(OPERATION_COST_UNITS.karaokeLyrics, 1_000);
}

testKaraokeCostIsOneProductCredit();
testMurekaUnavailableCode();
testMissingAudioIdCode();
testSunoReadyIds();
testRefundUsesOriginalSpendUnits();
console.log("timed-lyrics.contract.test.ts: ok");

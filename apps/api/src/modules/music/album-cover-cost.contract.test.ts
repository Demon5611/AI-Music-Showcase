/**
 * Cover product cost is always 0 — must never charge music 15/24.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/album-cover-cost.contract.test.ts
 */
import assert from "node:assert/strict";
import {
  isZeroCostOperation,
  OPERATION_COST_CREDITS,
  OPERATION_COST_UNITS,
  resolveMusicGenerateCostUnits,
} from "@ai-music/shared";
import { resolveAlbumCoverStrategy } from "./album-cover-strategy.js";

assert.equal(OPERATION_COST_CREDITS.albumCover, 0);
assert.equal(OPERATION_COST_UNITS.albumCover, 0);
assert.equal(isZeroCostOperation(OPERATION_COST_UNITS.albumCover), true);

assert.equal(resolveMusicGenerateCostUnits({ usePersonalVoice: false }), 15_000);
assert.equal(resolveMusicGenerateCostUnits({ usePersonalVoice: true }), 24_000);
assert.notEqual(OPERATION_COST_UNITS.albumCover, OPERATION_COST_UNITS.generateTrack);
assert.notEqual(
  OPERATION_COST_UNITS.albumCover,
  resolveMusicGenerateCostUnits({ usePersonalVoice: true }),
);

const audioengine = resolveAlbumCoverStrategy({
  musicProvider: "audioengine",
  providerTaskId: "audioengine-task",
});
assert.equal(audioengine.kind, "unavailable");

const legacyengine = resolveAlbumCoverStrategy({
  musicProvider: "legacyengineapi",
  providerTaskId: "legacyengine-task",
});
assert.equal(legacyengine.kind, "legacyengine_music_task");

console.log("album-cover-cost.contract.test.ts: ok");

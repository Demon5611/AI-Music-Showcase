/**
 * Run: pnpm --filter @ai-music/shared exec tsx src/utils/album-cover-cost.test.ts
 */
import assert from "node:assert/strict";
import { resolveMusicGenerateCostUnits } from "../constants/music-generate-cost.js";
import {
  canRequestAlbumCoverVariants,
  isAlbumCoverGenerationReady,
  resolveAlbumCoverProductCostCredits,
  resolveAlbumCoverProductCostUnits,
} from "./album-cover.js";

assert.equal(resolveAlbumCoverProductCostCredits(), 0);
assert.equal(resolveAlbumCoverProductCostUnits(), 0);
assert.notEqual(resolveAlbumCoverProductCostCredits(), 15);
assert.notEqual(resolveAlbumCoverProductCostCredits(), 24);

assert.equal(canRequestAlbumCoverVariants("sunoapi"), true);
assert.equal(canRequestAlbumCoverVariants("mureka"), false);
assert.equal(canRequestAlbumCoverVariants(null), false);

assert.equal(isAlbumCoverGenerationReady({ status: "completed" }), true);
assert.equal(isAlbumCoverGenerationReady({ status: "partial_success" }), true);
assert.equal(
  isAlbumCoverGenerationReady({ status: "processing", hasReadyTracks: true }),
  true,
);
assert.equal(
  isAlbumCoverGenerationReady({ status: "processing", hasReadyTracks: false }),
  false,
);
assert.equal(isAlbumCoverGenerationReady({ status: "pending", hasReadyTracks: true }), false);
assert.equal(isAlbumCoverGenerationReady({ status: "failed", hasReadyTracks: true }), false);
assert.equal(isAlbumCoverGenerationReady({ status: null }), false);

assert.equal(resolveMusicGenerateCostUnits({ usePersonalVoice: false }), 15_000);
assert.equal(resolveMusicGenerateCostUnits({ usePersonalVoice: true }), 24_000);

console.log("album-cover-cost.test.ts: ok");

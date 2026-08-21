/**
 * Cover failure / provider routing contract notes for album cover.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/album-cover-contract.test.ts
 *
 * Cover is an opt-in POST on a *completed* song. Failures throw from
 * album-cover.service only — they never transition MusicGeneration.status
 * and never refund the song spend key.
 *
 * Early playable tracks while status is still `processing` ARE enough when
 * hasReadyTracks is true — poll may stop before provider/DB flip to completed.
 * UI and API both gate on isAlbumCoverGenerationReady.
 */
import assert from "node:assert/strict";
import {
  isAlbumCoverGenerationReady,
  OPERATION_COST_UNITS,
  isZeroCostOperation,
} from "@ai-music/shared";
import { BadRequestError } from "../../common/errors.js";
import { resolveAlbumCoverStrategy } from "./album-cover-strategy.js";

function assertMurekaNeverYieldsSunoTaskId(taskId: string): void {
  const strategy = resolveAlbumCoverStrategy({
    musicProvider: "mureka",
    providerTaskId: taskId,
  });
  assert.equal(strategy.kind, "unavailable");
  assert.equal("sunoMusicTaskId" in strategy, false);
}

function assertCoverCostIsZeroUserCredits(): void {
  assert.equal(OPERATION_COST_UNITS.albumCover, 0);
  assert.equal(isZeroCostOperation(OPERATION_COST_UNITS.albumCover), true);
}

function assertUnavailableErrorDoesNotImplySongFailed(): void {
  const error = new BadRequestError(
    "Варианты обложки недоступны для этого трека",
    "ALBUM_COVER_UNAVAILABLE_FOR_PROVIDER",
  );
  assert.equal(error.statusCode, 400);
  assert.equal(error.code, "ALBUM_COVER_UNAVAILABLE_FOR_PROVIDER");
  // Song status is owned by music generate / poll paths — cover errors are HTTP only.
  assert.equal(error.name, "AppError");
}

function assertCoverReadyOnlyWhenGenerationFinished(): void {
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
  assert.equal(isAlbumCoverGenerationReady({ status: "pending" }), false);
}

assertMurekaNeverYieldsSunoTaskId("mureka-personal-voice-task");
assertMurekaNeverYieldsSunoTaskId("mureka-standard-vocal-task");
assertCoverCostIsZeroUserCredits();
assertUnavailableErrorDoesNotImplySongFailed();
assertCoverReadyOnlyWhenGenerationFinished();

const suno = resolveAlbumCoverStrategy({
  musicProvider: "sunoapi",
  providerTaskId: "suno-ok",
});
assert.equal(suno.kind, "suno_music_task");

console.log("album-cover-contract.test.ts: ok");

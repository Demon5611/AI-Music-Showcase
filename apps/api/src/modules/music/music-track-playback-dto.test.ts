/**
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/music-track-playback-dto.test.ts
 *
 * Contract: history DTO must omit /audio URLs for bucket-mismatched legacy tracks.
 */
import assert from "node:assert/strict";
import {
  isMusicTrackPlaybackAvailable,
  resolveMusicTrackAudioStatus,
} from "@ai-music/shared";

const configured = "ai-music-staging";

const playable = {
  persistenceState: "stored" as const,
  audioStorageKey: "music-generations/u/ok.mp3",
  persistenceErrorCode: null,
  storageObjectBucket: "ai-music-staging",
  configuredStorageBucket: configured,
};

const legacyMissing = {
  persistenceState: "stored" as const,
  audioStorageKey: "music-generations/u/legacy.mp3",
  persistenceErrorCode: null,
  storageObjectBucket: "ai-music-prod",
  configuredStorageBucket: configured,
};

assert.equal(resolveMusicTrackAudioStatus(playable), "stored");
assert.equal(isMusicTrackPlaybackAvailable(playable), true);
assert.equal(resolveMusicTrackAudioStatus(legacyMissing), "missing");
assert.equal(isMusicTrackPlaybackAvailable(legacyMissing), false);

const twenty = Array.from({ length: 20 }, (_, index) =>
  index < 10 ? playable : legacyMissing,
);
const playableCount = twenty.filter((row) => isMusicTrackPlaybackAvailable(row)).length;
assert.equal(playableCount, 10);

console.log("music-track-playback-dto.test.ts: ok");

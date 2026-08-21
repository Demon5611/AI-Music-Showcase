/**
 * Run: pnpm --filter @ai-music/shared exec tsx src/utils/music-track-playback.test.ts
 */
import assert from "node:assert/strict";
import {
  isMusicTrackPlaybackAvailable,
  resolveMusicTrackAudioStatus,
} from "./music-track-playback.js";

assert.equal(
  resolveMusicTrackAudioStatus({
    persistenceState: "stored",
    audioStorageKey: "music-generations/u/t.mp3",
  }),
  "stored",
);
assert.equal(
  isMusicTrackPlaybackAvailable({
    persistenceState: "stored",
    audioStorageKey: "music-generations/u/t.mp3",
  }),
  true,
);

assert.equal(
  resolveMusicTrackAudioStatus({
    persistenceState: "stored",
    audioStorageKey: "music-generations/u/t.mp3",
    persistenceErrorCode: "STORAGE_MISSING",
  }),
  "missing",
);
assert.equal(
  isMusicTrackPlaybackAvailable({
    persistenceState: "stored",
    audioStorageKey: "k",
    persistenceErrorCode: "STORAGE_MISSING",
  }),
  false,
);

assert.equal(
  resolveMusicTrackAudioStatus({
    persistenceState: "stored",
    audioStorageKey: "music-generations/u/legacy.mp3",
    storageObjectBucket: "ai-music-prod",
    configuredStorageBucket: "ai-music-staging",
  }),
  "missing",
);
assert.equal(
  isMusicTrackPlaybackAvailable({
    persistenceState: "stored",
    audioStorageKey: "music-generations/u/legacy.mp3",
    storageObjectBucket: "ai-music-prod",
    configuredStorageBucket: "ai-music-staging",
  }),
  false,
);

assert.equal(
  resolveMusicTrackAudioStatus({
    persistenceState: "stored",
    audioStorageKey: "music-generations/u/ok.mp3",
    storageObjectBucket: "ai-music-staging",
    configuredStorageBucket: "ai-music-staging",
  }),
  "stored",
);

assert.equal(
  resolveMusicTrackAudioStatus({
    persistenceState: "processing",
    audioStorageKey: null,
  }),
  "processing",
);
assert.equal(
  resolveMusicTrackAudioStatus({
    persistenceState: "failed",
    audioStorageKey: "k",
  }),
  "failed",
);
assert.equal(
  resolveMusicTrackAudioStatus({
    persistenceState: "stored",
    audioStorageKey: null,
  }),
  "none",
);

console.log("music-track-playback.test.ts: ok");

/**
 * Run: pnpm --filter @ai-music/web exec tsx src/shared/lib/is-track-playback-available.test.ts
 */
import assert from "node:assert/strict";
import { isTrackPlaybackAvailable } from "./is-track-playback-available.js";

assert.equal(isTrackPlaybackAvailable({ audioUrl: null }), false);
assert.equal(isTrackPlaybackAvailable({ audioUrl: "" }), false);
assert.equal(isTrackPlaybackAvailable({ audioUrl: "/api/music/tracks/1/audio" }), true);
assert.equal(
  isTrackPlaybackAvailable({
    audioUrl: "/api/music/tracks/1/audio",
    persistenceState: "stored",
  }),
  true,
);
assert.equal(
  isTrackPlaybackAvailable({
    audioUrl: "/api/music/tracks/1/audio",
    persistenceState: "processing",
  }),
  false,
);
assert.equal(
  isTrackPlaybackAvailable({
    audioUrl: "/api/music/tracks/1/audio",
    persistenceState: "failed",
  }),
  false,
);
assert.equal(
  isTrackPlaybackAvailable({
    audioUrl: "/api/music/tracks/1/audio",
    playbackAvailable: false,
    audioStatus: "missing",
  }),
  false,
);
assert.equal(
  isTrackPlaybackAvailable({
    audioUrl: "",
    playbackAvailable: true,
    audioStatus: "stored",
  }),
  false,
);
assert.equal(
  isTrackPlaybackAvailable({
    audioUrl: "/api/music/tracks/1/audio",
    playbackAvailable: true,
    audioStatus: "stored",
  }),
  true,
);

console.log("is-track-playback-available.test.ts: ok");

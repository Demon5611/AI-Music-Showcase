/**
 * Timed-lyrics UI policy contract (no auto-POST / no retry storm).
 * Run: pnpm --filter @ai-music/shared exec tsx src/utils/timed-lyrics-ui-policy.test.ts
 */
import assert from "node:assert/strict";
import { isTimedLyricsAvailableForProvider } from "./timed-lyrics-capability.js";

function shouldEnableTimedLyricsCacheQuery(input: {
  trackId?: string;
  karaokeEnabled: boolean;
  canUseKaraoke: boolean;
  hasLyrics: boolean;
  musicProvider?: string | null;
}): boolean {
  return Boolean(
    input.trackId &&
      input.karaokeEnabled &&
      input.canUseKaraoke &&
      input.hasLyrics &&
      isTimedLyricsAvailableForProvider(input.musicProvider),
  );
}

assert.equal(
  shouldEnableTimedLyricsCacheQuery({
    trackId: "t1",
    karaokeEnabled: true,
    canUseKaraoke: true,
    hasLyrics: true,
    musicProvider: "sunoapi",
  }),
  true,
);

assert.equal(
  shouldEnableTimedLyricsCacheQuery({
    trackId: "t1",
    karaokeEnabled: true,
    canUseKaraoke: true,
    hasLyrics: true,
    musicProvider: "mureka",
  }),
  false,
);

assert.equal(
  shouldEnableTimedLyricsCacheQuery({
    trackId: "t1",
    karaokeEnabled: true,
    canUseKaraoke: true,
    hasLyrics: false,
    musicProvider: "sunoapi",
  }),
  false,
);

console.log("timed-lyrics-ui-policy.test.ts: ok");

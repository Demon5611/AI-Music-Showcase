/**
 * Run: pnpm --filter @ai-music/shared exec tsx src/utils/timed-lyrics-capability.test.ts
 */
import assert from "node:assert/strict";
import { isTimedLyricsAvailableForProvider } from "./timed-lyrics-capability.js";

assert.equal(isTimedLyricsAvailableForProvider("sunoapi"), true);
assert.equal(isTimedLyricsAvailableForProvider("SunoAPI"), true);
assert.equal(isTimedLyricsAvailableForProvider("mureka"), false);
assert.equal(isTimedLyricsAvailableForProvider(null), false);
assert.equal(isTimedLyricsAvailableForProvider(""), false);
assert.equal(isTimedLyricsAvailableForProvider("  "), false);

console.log("timed-lyrics-capability.test.ts: ok");

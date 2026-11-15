/**
 * Run: pnpm --filter @ai-music/shared exec tsx src/utils/timed-lyrics-capability.test.ts
 */
import assert from "node:assert/strict";
import { isTimedLyricsAvailableForProvider } from "./timed-lyrics-capability.js";

assert.equal(isTimedLyricsAvailableForProvider("legacyengineapi"), true);
assert.equal(isTimedLyricsAvailableForProvider("LegacyengineAPI"), true);
assert.equal(isTimedLyricsAvailableForProvider("audioengine"), false);
assert.equal(isTimedLyricsAvailableForProvider(null), false);
assert.equal(isTimedLyricsAvailableForProvider(""), false);
assert.equal(isTimedLyricsAvailableForProvider("  "), false);

console.log("timed-lyrics-capability.test.ts: ok");

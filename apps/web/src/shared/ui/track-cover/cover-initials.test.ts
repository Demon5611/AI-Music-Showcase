/**
 * Run: pnpm --filter @ai-music/web exec tsx src/shared/ui/track-cover/cover-initials.test.ts
 */
import assert from "node:assert/strict";
import { coverInitialsFromTitle } from "./cover-initials";

assert.equal(coverInitialsFromTitle("Hello World"), "HW");
assert.equal(coverInitialsFromTitle("alone"), "AL");
assert.equal(coverInitialsFromTitle("  "), "?");
assert.equal(coverInitialsFromTitle("Мой трек"), "МТ");
console.log("cover-initials.test.ts: ok");

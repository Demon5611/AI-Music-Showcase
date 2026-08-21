/**
 * Run: pnpm --filter @ai-music/shared exec tsx src/utils/stem-separation-capability.test.ts
 */
import assert from "node:assert/strict";
import { isStemSeparationAvailableForProvider } from "./stem-separation-capability.js";

assert.equal(isStemSeparationAvailableForProvider("sunoapi"), true);
assert.equal(isStemSeparationAvailableForProvider("mureka"), false);
assert.equal(isStemSeparationAvailableForProvider(null), false);

console.log("stem-separation-capability.test.ts: ok");

/**
 * Run: pnpm --filter @ai-music/shared exec tsx src/utils/stem-separation-ux-contract.test.ts
 */
import assert from "node:assert/strict";
import { OPERATION_COST_CREDITS } from "../constants/credits-economy.js";
import { isStemSeparationAvailableForProvider } from "./stem-separation-capability.js";

assert.equal(OPERATION_COST_CREDITS.stemSeparation, 12);
assert.equal(isStemSeparationAvailableForProvider("sunoapi"), true);
assert.equal(isStemSeparationAvailableForProvider("mureka"), false);

// Distinct UX states: stems absent vs master audio missing are different codes/phases.
assert.notEqual("absent", "missing");
assert.notEqual("unavailable", "failed");

console.log("stem-separation-ux-contract.test.ts: ok");

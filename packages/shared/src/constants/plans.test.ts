import assert from "node:assert/strict";
import {
  CREDIT_UNIT_SCALE,
  FREE_DEMO_CREDITS,
  FREE_DEMO_CREDIT_UNITS,
  creditsToUnits,
} from "./credits-economy.js";
import { PAID_PLAN_IDS, PLANS } from "./plans.js";

assert.equal(PLANS.free.monthlyCredits, 50);
assert.equal(PLANS.pro.monthlyCredits, 500);
assert.equal(PLANS.studio.monthlyCredits, 2000);

assert.equal(PLANS.free.priceUsd, 0);
assert.equal(PLANS.pro.priceUsd, 19);
assert.equal(PLANS.studio.priceUsd, 49);

assert.equal(PLANS.free.id, "free");
assert.equal(PLANS.pro.id, "pro");
assert.equal(PLANS.studio.id, "studio");

assert.equal(PLANS.free.features.musicGeneration, "full");
assert.equal(PLANS.free.features.editor, "advanced");
assert.equal(PLANS.free.features.stemSeparation, true);
assert.equal(PLANS.free.features.wavExport, true);
assert.equal(PLANS.free.features.aiRemix, true);
assert.equal(PLANS.free.maxTrackDurationSec, 180);
assert.equal(PLANS.studio.features.maxProjects, null);

assert.deepEqual([...PAID_PLAN_IDS], ["pro", "studio"]);
assert.ok(!(PAID_PLAN_IDS as readonly string[]).includes("free"));

assert.equal(FREE_DEMO_CREDITS, PLANS.free.monthlyCredits);
assert.equal(FREE_DEMO_CREDIT_UNITS, creditsToUnits(PLANS.free.monthlyCredits));
assert.equal(creditsToUnits(50), 50_000);
assert.equal(creditsToUnits(500), 500_000);
assert.equal(creditsToUnits(2000), 2_000_000);
assert.equal(CREDIT_UNIT_SCALE, 1000);

console.log("plans.test.ts: ok");

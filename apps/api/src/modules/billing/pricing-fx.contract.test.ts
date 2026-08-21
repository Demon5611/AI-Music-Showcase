/**
 * Pricing FX quote uses the same NBG conversion as checkout snapshots.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/billing/pricing-fx.contract.test.ts
 */
import assert from "node:assert/strict";
import { convertUsdMajorToGel } from "@ai-music/shared";
import { getCreditPackPricingFxQuote } from "./credit-pack-checkout.service.js";

const RATE = "2.6138";

assert.equal(convertUsdMajorToGel("9", RATE).gelMajor, "23.52");
assert.equal(convertUsdMajorToGel("29", RATE).gelMajor, "75.80");
assert.equal(convertUsdMajorToGel("99", RATE).gelMajor, "258.77");

const unavailable = await getCreditPackPricingFxQuote({
  getUsdGelQuote: async () => {
    throw new Error("nbg down");
  },
});
assert.equal(unavailable.available, false);
assert.equal(unavailable.packs.starter, null);

const quotedAt = new Date("2026-08-20T12:00:00.000Z");
const available = await getCreditPackPricingFxQuote({
  getUsdGelQuote: async () => ({
    baseCurrency: "USD",
    quoteCurrency: "GEL",
    rate: RATE,
    quotedAt,
    source: "nbg",
  }),
});
assert.equal(available.available, true);
assert.equal(available.rate, RATE);
assert.equal(available.source, "nbg");
assert.equal(available.packs.starter, "23.52");
assert.equal(available.packs.creator, "75.80");
assert.equal(available.packs.studio, "258.77");

console.log("pricing-fx.contract.test.ts: ok");

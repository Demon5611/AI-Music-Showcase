import assert from "node:assert/strict";
import {
  CREDIT_PACKAGES,
  CREDIT_PACKAGES_COPY_EN,
  CREDIT_PACKAGES_COPY_RU,
  FREE_CREDIT_OFFER,
  SHARED_AI_TOOLS,
  getCreditPackagePriceUsd,
  getPackageSavingsPercent,
  pricePerCreditUsd,
  savingsPercentVsStarter,
} from "./credit-packages.js";
import { FLITT_PRODUCTION_PRICING_APPROVED } from "./flitt-checkout.js";

assert.equal(FREE_CREDIT_OFFER.credits, 50);
assert.equal(FREE_CREDIT_OFFER.priceUsd, 0);
assert.equal(CREDIT_PACKAGES.length, 3);
assert.equal(SHARED_AI_TOOLS.length, 7);

const byId = Object.fromEntries(CREDIT_PACKAGES.map((pkg) => [pkg.id, pkg]));

assert.equal(byId.starter?.priceUsd, 9);
assert.equal(FLITT_PRODUCTION_PRICING_APPROVED, true);
assert.equal("priceGel" in (byId.starter ?? {}), false);
assert.equal(getCreditPackagePriceUsd("starter"), 9);
assert.equal(getCreditPackagePriceUsd("creator"), 29);
assert.equal(byId.starter?.credits, 500);
assert.equal(getPackageSavingsPercent("starter"), null);

assert.equal(byId.creator?.priceUsd, 29);
assert.equal(byId.creator?.credits, 2000);
assert.equal(byId.creator?.featured, true);
assert.equal(getPackageSavingsPercent("creator"), 19);

assert.equal(byId.studio?.priceUsd, 99);
assert.equal(byId.studio?.credits, 8000);
assert.equal(byId.studio?.bestValue, true);
assert.equal(getPackageSavingsPercent("studio"), 31);

assert.equal(pricePerCreditUsd(9, 500), 0.018);
assert.equal(pricePerCreditUsd(29, 2000), 0.0145);
assert.equal(pricePerCreditUsd(99, 8000), 0.012375);
assert.equal(savingsPercentVsStarter(29, 2000), 19);
assert.equal(savingsPercentVsStarter(99, 8000), 31);

assert.equal("queue" in (byId.starter ?? {}), false);
assert.equal("maxProjects" in (byId.starter ?? {}), false);
assert.equal("storageGb" in (byId.starter ?? {}), false);

assert.match(CREDIT_PACKAGES_COPY_EN.headline, /prepaid credits/i);
assert.match(CREDIT_PACKAGES_COPY_EN.enoughForVoice, /Enough credits to create/);
assert.match(CREDIT_PACKAGES_COPY_RU.enoughForVoice, /Хватает на создание/);
assert.match(CREDIT_PACKAGES_COPY_RU.explanation, /Кредиты расходуются/);
assert.equal(CREDIT_PACKAGES_COPY_EN.saveVsStarter(19), "≈19% cheaper per credit than Starter");
assert.equal(CREDIT_PACKAGES_COPY_RU.saveVsStarter(31), "≈31% дешевле за кредит, чем Starter");

for (const text of [
  JSON.stringify(CREDIT_PACKAGES_COPY_EN),
  JSON.stringify(CREDIT_PACKAGES_COPY_RU),
  JSON.stringify(CREDIT_PACKAGES),
]) {
  assert.equal(text.toLowerCase().includes("в месяц"), false);
  assert.equal(text.includes("Обычная очередь"), false);
  assert.equal(text.includes("полных циклов"), false);
  assert.equal(text.includes("AI-flow"), false);
}

console.log("credit-packages.test.ts: ok");

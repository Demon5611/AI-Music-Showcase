/**
 * Guardrails for prepaid credit packages pricing UI.
 * Run: `pnpm --filter @ai-music/shared exec tsx ../../apps/web/src/features/billing/credit-packages-pricing.ui.test.ts`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sharedRoot = join(here, "../../../../../packages/shared/src/constants");
const packagesPanel = readFileSync(join(here, "credit-packages-pricing-panel.tsx"), "utf8");
const checkoutHook = readFileSync(join(here, "hooks/use-credit-pack-checkout.ts"), "utf8");
const billingClient = readFileSync(
  join(here, "../../../../../packages/api-client/src/billing.ts"),
  "utf8",
);
const pricingEntry = readFileSync(join(here, "pricing-panel.tsx"), "utf8");
const creditPackagesSource = readFileSync(join(sharedRoot, "credit-packages.ts"), "utf8");
const plansSource = readFileSync(join(sharedRoot, "plans.ts"), "utf8");
const sharedTypesSource = readFileSync(join(here, "../../../../../packages/shared/src/types/index.ts"), "utf8");
const enMessages = readFileSync(join(here, "../../../messages/en.json"), "utf8");
const ruMessages = readFileSync(join(here, "../../../messages/ru.json"), "utf8");

assert.match(creditPackagesSource, /Starter Pack/);
assert.match(creditPackagesSource, /Creator Pack/);
assert.match(creditPackagesSource, /Studio Pack/);
assert.match(creditPackagesSource, /priceUsd:\s*9/);
assert.match(creditPackagesSource, /credits:\s*500/);
assert.match(creditPackagesSource, /credits:\s*8000/);
assert.match(creditPackagesSource, /savingsPercentVsStarter/);
assert.equal(creditPackagesSource.includes("savePercent:"), false);
assert.equal(creditPackagesSource.includes("queue:"), false);
assert.equal(creditPackagesSource.includes("storageGb"), false);

assert.match(packagesPanel, /getPackageSavingsPercent/);
assert.match(packagesPanel, /CoreProductFeatures/);
assert.match(packagesPanel, /enoughForPersonalVoice/);
assert.match(packagesPanel, /personalVoiceAvailable/);
assert.equal(packagesPanel.includes("createCheckoutSession"), false);
assert.equal(packagesPanel.includes("TBC_API_KEY"), false);
assert.equal(packagesPanel.includes("FLITT_PAYMENT_KEY"), false);
assert.equal(packagesPanel.includes("NEXT_PUBLIC_TBC"), false);
assert.equal(packagesPanel.includes("NEXT_PUBLIC_FLITT"), false);
assert.equal(packagesPanel.includes("Обычная очередь"), false);
assert.equal(packagesPanel.includes("creditsAmount"), false);
assert.equal(packagesPanel.includes("starterCredits"), false);
assert.match(packagesPanel, /useCreditPackCheckout/);
assert.match(packagesPanel, /data-checkout=\{checkout\.statusLoading \? "loading" : "disabled"\}/);
assert.match(packagesPanel, /!checkout\.checkoutEnabled/);
assert.match(packagesPanel, /data-checkout=\{checkout\.busy \? "pending" : "ready"\}/);
assert.match(packagesPanel, /FreePackageCard/);
assert.equal(packagesPanel.includes("startCheckout(\"free\")"), false);

assert.match(checkoutHook, /getCreditPackCheckoutStatus/);
assert.match(checkoutHook, /createCreditPackCheckout/);
assert.match(checkoutHook, /packageId,/);
assert.match(checkoutHook, /clientRequestId/);
assert.match(checkoutHook, /clientRequestIdsRef/);
assert.match(checkoutHook, /crypto\.randomUUID\(\)/);
assert.match(checkoutHook, /isHttpsAbsoluteUrl\(result\.approvalUrl\)/);
assert.match(checkoutHook, /window\.location\.assign\(result\.approvalUrl\)/);
assert.equal(checkoutHook.includes("amount"), false);
assert.equal(checkoutHook.includes("credits:"), false);
assert.equal(checkoutHook.includes("currency"), false);
assert.equal(checkoutHook.includes("TBC_API_KEY"), false);
assert.equal(checkoutHook.includes("FLITT_PAYMENT_KEY"), false);
assert.match(checkoutHook, /statusQuery\.data\?\.checkoutEnabled === true/);
assert.doesNotMatch(checkoutHook, /checkoutEnabled:\s*true/);

assert.match(billingClient, /getCreditPackCheckoutStatus/);
assert.match(billingClient, /createCreditPackCheckout/);
assert.match(billingClient, /\/api\/billing\/credit-packs\/checkout-status/);
assert.match(billingClient, /\/api\/billing\/credit-packs\/checkout/);
assert.equal(billingClient.includes("TBC_API_KEY"), false);
assert.equal(billingClient.includes("FLITT_PAYMENT_KEY"), false);
assert.equal(billingClient.includes("amount"), false);

assert.match(pricingEntry, /CreditPackagesPricingPanel/);
assert.equal(pricingEntry.includes("createCheckoutSession"), false);
assert.equal(pricingEntry.includes("StripeSubscription"), false);
assert.equal(pricingEntry.includes("isCreditPackagesBillingMode"), false);
assert.equal(sharedTypesSource.includes("stripePaymentId"), false);
assert.equal(sharedTypesSource.includes("pendingCheckoutSessionId"), false);
assert.equal(sharedTypesSource.includes("stripeCustomerId"), false);

assert.match(plansSource, /ALL_TOOLS_FEATURES/);
assert.match(plansSource, /priorityQueue: false/);

assert.match(enMessages, /Enough credits to create a Personal AI Voice/);
assert.match(ruMessages, /Хватает на создание персонального AI-голоса/);
assert.match(enMessages, /Personal AI Voice available from/);
assert.match(ruMessages, /Персональный AI-голос доступен от/);
assert.equal(enMessages.includes("Standard queue"), false);
assert.equal(ruMessages.includes("Обычная очередь"), false);
assert.equal(ruMessages.includes("AI-flow"), false);
assert.equal(ruMessages.includes("полных циклов"), false);

console.log("credit-packages-pricing.ui.test.ts: ok");

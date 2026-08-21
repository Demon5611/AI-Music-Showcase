/**
 * Guardrails for Flitt browser return UX.
 * Run: pnpm --filter @ai-music/shared exec tsx ../../apps/web/src/features/billing/payment-return.ui.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const panel = readFileSync(join(here, "payment-return-panel.tsx"), "utf8");
const hook = readFileSync(join(here, "hooks/use-payment-return-purchase.ts"), "utf8");
const proxy = readFileSync(join(here, "../../proxy.ts"), "utf8");
const redirectHelper = readFileSync(
  join(here, "../../shared/lib/payment-return-redirect.ts"),
  "utf8",
);
const route = readFileSync(join(here, "../../app/api/payment-return/route.ts"), "utf8");
const page = readFileSync(join(here, "../../app/[locale]/payment-return/page.tsx"), "utf8");
const billingClient = readFileSync(
  join(here, "../../../../../packages/api-client/src/billing.ts"),
  "utf8",
);
const checkoutService = readFileSync(
  join(here, "../../../../../apps/api/src/modules/billing/credit-pack-checkout.service.ts"),
  "utf8",
);
const fulfillment = readFileSync(
  join(here, "../../../../../apps/api/src/modules/billing/flitt-payment-fulfillment.service.ts"),
  "utf8",
);
const enMessages = readFileSync(join(here, "../../../messages/en.json"), "utf8");
const ruMessages = readFileSync(join(here, "../../../messages/ru.json"), "utf8");

assert.match(page, /PaymentReturnPanel/);
assert.match(page, /robots:\s*\{\s*index:\s*false/);
assert.match(route, /status:\s*303/);
assert.match(route, /Location:\s*location/);
assert.doesNotMatch(route, /url\.origin|localhost/);
assert.match(route, /readPaymentReturnPurchaseId/);
assert.doesNotMatch(route, /grantCredits|handleFlittCallback|FLITT_PAYMENT_KEY/);
assert.match(redirectHelper, /303/);
assert.match(proxy, /redirectFlittBrowserReturn/);
assert.match(proxy, /isPaymentReturnApiPath/);
assert.match(proxy, /isLegacyPricingReturnPath/);
assert.match(hook, /api\.billing\.getPurchase/);
assert.match(hook, /purchaseId/);
assert.match(hook, /order_id/);
assert.doesNotMatch(hook, /createCreditPackCheckout|grantCredits|signature/);
assert.match(panel, /usePaymentReturnPurchase/);
assert.match(panel, /parseApiError/);
assert.doesNotMatch(panel, /Suno|Flitt|TBC|Kits/);
assert.doesNotMatch(panel, /searchParams\.get\("signature"\)|searchParams\.get\("amount"\)/);
assert.match(billingClient, /getPurchase/);
assert.match(billingClient, /\/api\/billing\/purchases\//);
assert.match(checkoutService, /appendPurchaseIdToReturnUrl/);
assert.doesNotMatch(
  checkoutService.slice(
    checkoutService.indexOf("export async function getCreditPackPurchaseStatusOnly"),
    checkoutService.indexOf("export {"),
  ),
  /handleFlittCallback/,
);
assert.match(fulfillment, /handleFlittCallback/);
assert.match(enMessages, /Confirming payment/);
assert.match(ruMessages, /Подтверждаем оплату/);
assert.match(enMessages, /Credits are added only after the payment is verified by the server/);

console.log("payment-return.ui.test.ts: ok");

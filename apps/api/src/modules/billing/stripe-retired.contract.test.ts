/**
 * Invariant: Stripe is retired from runtime, env, current schema, and billing routes.
 * Historical migrations and webhook_events.provider="stripe" may remain.
 *
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/billing/stripe-retired.contract.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../../../");

const billingRoutes = readFileSync(join(here, "routes.ts"), "utf8");
const entitlements = readFileSync(join(here, "entitlements.service.ts"), "utf8");
const subscription = readFileSync(join(here, "subscription.service.ts"), "utf8");
const apiEnv = readFileSync(join(here, "../../config/env.ts"), "utf8");
const apiPackage = readFileSync(join(here, "../../../package.json"), "utf8");
const schema = readFileSync(join(repoRoot, "packages/db/prisma/schema.prisma"), "utf8");
const ledger = readFileSync(join(repoRoot, "packages/db/src/credits-ledger.ts"), "utf8");
const envExample = readFileSync(join(repoRoot, ".env.example"), "utf8");
const webhookEvents = readFileSync(
  join(here, "../webhooks/webhook-event.service.ts"),
  "utf8",
);

assert.equal(billingRoutes.includes("create-checkout-session"), false);
assert.equal(billingRoutes.includes("billing/portal"), false);
assert.equal(billingRoutes.includes("billing/webhook"), false);
assert.equal(billingRoutes.includes("stripe"), false);
assert.match(billingRoutes, /credit-packs\/checkout/);
assert.match(billingRoutes, /tbc\/callback/);

assert.equal(entitlements.includes("currentPeriodEnd"), false);
assert.equal(entitlements.includes("pendingPlanId"), false);
assert.equal(entitlements.includes("pendingChangeStatus"), false);
assert.equal(subscription.includes("stripe"), false);

assert.equal(apiEnv.includes("STRIPE_"), false);
assert.equal(apiPackage.includes('"stripe"'), false);
assert.equal(envExample.includes("STRIPE_"), false);

assert.equal(schema.includes("stripe_"), false);
assert.equal(schema.includes("stripePaymentId"), false);
assert.equal(schema.includes("stripeCustomerId"), false);
assert.equal(schema.includes("pendingCheckoutSessionId"), false);
assert.match(schema, /model Subscription/);
assert.match(schema, /model CreditPackPurchase/);

assert.equal(ledger.includes("stripePaymentId"), false);

assert.match(webhookEvents, /"stripe"/);

console.log("stripe-retired.contract.test.ts: ok");

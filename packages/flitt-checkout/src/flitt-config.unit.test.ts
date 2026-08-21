import assert from "node:assert/strict";
import {
  FLITT_PRODUCTION_CALLBACK_URL,
  FLITT_PRODUCTION_PRICING_APPROVED,
  FLITT_PRODUCTION_RETURN_URL,
  FLITT_PUBLIC_TEST_MERCHANT_ID,
} from "@ai-music/shared";
import {
  isFlittCheckoutReady,
  isFlittProviderReady,
  resolveFlittCheckoutConfig,
  resolveFlittProviderConfig,
} from "./flitt-config.js";

const stagingReady = {
  APP_ENV: "staging",
  FLITT_ENABLED: true,
  FLITT_API_BASE_URL: "https://pay.flitt.com",
  FLITT_MERCHANT_ID: String(FLITT_PUBLIC_TEST_MERCHANT_ID),
  FLITT_PAYMENT_KEY: "staging-test-key",
  FLITT_CURRENCY: "GEL",
  FLITT_CALLBACK_URL: "https://api.example.com/api/billing/flitt/callback",
  FLITT_RETURN_URL: "https://web.example.com/api/payment-return",
};

const productionReady = {
  APP_ENV: "production",
  FLITT_ENABLED: true,
  FLITT_API_BASE_URL: "https://pay.flitt.com",
  FLITT_MERCHANT_ID: "999000001",
  FLITT_PAYMENT_KEY: "live-payment-key-not-a-secret",
  FLITT_CURRENCY: "GEL",
  FLITT_CALLBACK_URL: FLITT_PRODUCTION_CALLBACK_URL,
  FLITT_RETURN_URL: FLITT_PRODUCTION_RETURN_URL,
  FLITT_PRODUCTION_PRICING_APPROVED: true,
};

assert.equal(FLITT_PRODUCTION_PRICING_APPROVED, true);
assert.equal(isFlittCheckoutReady({ FLITT_ENABLED: false }), false);
assert.equal(isFlittCheckoutReady({ FLITT_ENABLED: true }), false);
assert.equal(isFlittProviderReady({ FLITT_ENABLED: false }), false);
assert.equal(isFlittCheckoutReady(stagingReady), true);

const config = resolveFlittCheckoutConfig(stagingReady);
assert.ok(config);
assert.equal(config.currency, "GEL");
assert.equal(config.merchantId, FLITT_PUBLIC_TEST_MERCHANT_ID);
assert.equal(config.apiBaseUrl, "https://pay.flitt.com");

assert.equal(
  isFlittCheckoutReady({
    ...stagingReady,
    FLITT_API_BASE_URL: "https://evil.example",
  }),
  false,
);

assert.equal(
  isFlittCheckoutReady({
    ...stagingReady,
    FLITT_CALLBACK_URL: "http://api.example.com/api/billing/flitt/callback",
  }),
  false,
);

assert.equal(
  resolveFlittCheckoutConfig({
    APP_ENV: "production",
    FLITT_ENABLED: false,
  }),
  null,
);
assert.equal(isFlittCheckoutReady({ APP_ENV: "production", FLITT_ENABLED: false }), false);
assert.equal(isFlittProviderReady({ APP_ENV: "production", FLITT_ENABLED: false }), false);

assert.equal(
  isFlittProviderReady({
    APP_ENV: "production",
    FLITT_ENABLED: true,
    FLITT_MERCHANT_ID: productionReady.FLITT_MERCHANT_ID,
    FLITT_PAYMENT_KEY: productionReady.FLITT_PAYMENT_KEY,
  }),
  true,
  "worker refund/status does not require callback/return URLs",
);

const providerOnly = resolveFlittProviderConfig({
  APP_ENV: "production",
  FLITT_ENABLED: true,
  FLITT_MERCHANT_ID: productionReady.FLITT_MERCHANT_ID,
  FLITT_PAYMENT_KEY: productionReady.FLITT_PAYMENT_KEY,
});
assert.ok(providerOnly);
assert.equal("callbackUrl" in providerOnly, false);
assert.equal("returnUrl" in providerOnly, false);

assert.throws(
  () =>
    resolveFlittProviderConfig({
      APP_ENV: "production",
      FLITT_ENABLED: true,
      FLITT_MERCHANT_ID: String(FLITT_PUBLIC_TEST_MERCHANT_ID),
      FLITT_PAYMENT_KEY: "staging-test-key",
    }),
  /public test merchant/,
);

assert.throws(
  () =>
    resolveFlittCheckoutConfig({
      ...stagingReady,
      APP_ENV: "production",
    }),
  /public test merchant|USD→GEL pricing policy|production API Flitt callback/,
);

assert.equal(isFlittCheckoutReady({ ...stagingReady, APP_ENV: "production" }), false);

assert.throws(
  () =>
    resolveFlittCheckoutConfig({
      ...productionReady,
      FLITT_PRODUCTION_PRICING_APPROVED: false,
    }),
  /USD→GEL pricing policy/,
);

assert.throws(
  () =>
    resolveFlittCheckoutConfig({
      ...productionReady,
      FLITT_CALLBACK_URL: "https://api-staging.example.com/api/billing/flitt/callback",
      FLITT_RETURN_URL: FLITT_PRODUCTION_RETURN_URL,
    }),
  /localhost or staging|production API Flitt callback/,
);

assert.throws(
  () =>
    resolveFlittCheckoutConfig({
      ...productionReady,
      FLITT_RETURN_URL: "https://web-staging.example.com/api/payment-return",
    }),
  /localhost or staging|payment-return/,
);

assert.throws(
  () =>
    resolveFlittCheckoutConfig({
      ...productionReady,
      FLITT_CALLBACK_URL: "https://localhost:3001/api/billing/flitt/callback",
    }),
  /localhost or staging|production API Flitt callback/,
);

assert.throws(
  () =>
    resolveFlittCheckoutConfig({
      APP_ENV: "production",
      FLITT_ENABLED: true,
      FLITT_MERCHANT_ID: productionReady.FLITT_MERCHANT_ID,
      FLITT_PAYMENT_KEY: productionReady.FLITT_PAYMENT_KEY,
    }),
  /missing: FLITT_CALLBACK_URL, FLITT_RETURN_URL/,
);

const live = resolveFlittCheckoutConfig(productionReady);
assert.ok(live);
assert.equal(live.callbackUrl, FLITT_PRODUCTION_CALLBACK_URL);
assert.equal(live.returnUrl, FLITT_PRODUCTION_RETURN_URL);
assert.equal(live.merchantId, 999000001);
assert.equal(isFlittCheckoutReady(productionReady), true);

console.log("flitt-config.unit.test.ts: ok");

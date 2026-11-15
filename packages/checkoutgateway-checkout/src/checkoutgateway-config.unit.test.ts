import assert from "node:assert/strict";
import {
  CHECKOUTGATEWAY_PRODUCTION_CALLBACK_URL,
  CHECKOUTGATEWAY_DEMO_PRICING_CONFIGURED,
  CHECKOUTGATEWAY_PRODUCTION_RETURN_URL,
  CHECKOUTGATEWAY_PUBLIC_TEST_MERCHANT_ID,
} from "@ai-music/shared";
import {
  isCheckoutgatewayCheckoutReady,
  isCheckoutgatewayProviderReady,
  resolveCheckoutgatewayCheckoutConfig,
  resolveCheckoutgatewayProviderConfig,
} from "./checkoutgateway-config.js";

const stagingReady = {
  APP_ENV: "staging",
  CHECKOUTGATEWAY_ENABLED: true,
  CHECKOUTGATEWAY_API_BASE_URL: "https://pay.integration.example.invalid",
  CHECKOUTGATEWAY_MERCHANT_ID: String(CHECKOUTGATEWAY_PUBLIC_TEST_MERCHANT_ID),
  CHECKOUTGATEWAY_PAYMENT_KEY: "staging-test-key",
  CHECKOUTGATEWAY_CURRENCY: "GEL",
  CHECKOUTGATEWAY_CALLBACK_URL: "https://api.example.com/api/billing/checkoutgateway/callback",
  CHECKOUTGATEWAY_RETURN_URL: "https://web.example.com/api/payment-return",
};

const productionReady = {
  APP_ENV: "production",
  CHECKOUTGATEWAY_ENABLED: true,
  CHECKOUTGATEWAY_API_BASE_URL: "https://pay.integration.example.invalid",
  CHECKOUTGATEWAY_MERCHANT_ID: "999000001",
  CHECKOUTGATEWAY_PAYMENT_KEY: "live-payment-key-not-a-secret",
  CHECKOUTGATEWAY_CURRENCY: "GEL",
  CHECKOUTGATEWAY_CALLBACK_URL: CHECKOUTGATEWAY_PRODUCTION_CALLBACK_URL,
  CHECKOUTGATEWAY_RETURN_URL: CHECKOUTGATEWAY_PRODUCTION_RETURN_URL,
  CHECKOUTGATEWAY_DEMO_PRICING_CONFIGURED: true,
};

assert.equal(CHECKOUTGATEWAY_DEMO_PRICING_CONFIGURED, true);
assert.equal(isCheckoutgatewayCheckoutReady({ CHECKOUTGATEWAY_ENABLED: false }), false);
assert.equal(isCheckoutgatewayCheckoutReady({ CHECKOUTGATEWAY_ENABLED: true }), false);
assert.equal(isCheckoutgatewayProviderReady({ CHECKOUTGATEWAY_ENABLED: false }), false);
assert.equal(isCheckoutgatewayCheckoutReady(stagingReady), true);

const config = resolveCheckoutgatewayCheckoutConfig(stagingReady);
assert.ok(config);
assert.equal(config.currency, "GEL");
assert.equal(config.merchantId, CHECKOUTGATEWAY_PUBLIC_TEST_MERCHANT_ID);
assert.equal(config.apiBaseUrl, "https://pay.integration.example.invalid");

assert.equal(
  isCheckoutgatewayCheckoutReady({
    ...stagingReady,
    CHECKOUTGATEWAY_API_BASE_URL: "https://evil.example",
  }),
  false,
);

assert.equal(
  isCheckoutgatewayCheckoutReady({
    ...stagingReady,
    CHECKOUTGATEWAY_CALLBACK_URL: "http://api.example.com/api/billing/checkoutgateway/callback",
  }),
  false,
);

assert.equal(
  resolveCheckoutgatewayCheckoutConfig({
    APP_ENV: "production",
    CHECKOUTGATEWAY_ENABLED: false,
  }),
  null,
);
assert.equal(isCheckoutgatewayCheckoutReady({ APP_ENV: "production", CHECKOUTGATEWAY_ENABLED: false }), false);
assert.equal(isCheckoutgatewayProviderReady({ APP_ENV: "production", CHECKOUTGATEWAY_ENABLED: false }), false);

assert.equal(
  isCheckoutgatewayProviderReady({
    APP_ENV: "production",
    CHECKOUTGATEWAY_ENABLED: true,
    CHECKOUTGATEWAY_MERCHANT_ID: productionReady.CHECKOUTGATEWAY_MERCHANT_ID,
    CHECKOUTGATEWAY_PAYMENT_KEY: productionReady.CHECKOUTGATEWAY_PAYMENT_KEY,
  }),
  true,
  "worker refund/status does not require callback/return URLs",
);

const providerOnly = resolveCheckoutgatewayProviderConfig({
  APP_ENV: "production",
  CHECKOUTGATEWAY_ENABLED: true,
  CHECKOUTGATEWAY_MERCHANT_ID: productionReady.CHECKOUTGATEWAY_MERCHANT_ID,
  CHECKOUTGATEWAY_PAYMENT_KEY: productionReady.CHECKOUTGATEWAY_PAYMENT_KEY,
});
assert.ok(providerOnly);
assert.equal("callbackUrl" in providerOnly, false);
assert.equal("returnUrl" in providerOnly, false);

assert.throws(
  () =>
    resolveCheckoutgatewayProviderConfig({
      APP_ENV: "production",
      CHECKOUTGATEWAY_ENABLED: true,
      CHECKOUTGATEWAY_MERCHANT_ID: String(CHECKOUTGATEWAY_PUBLIC_TEST_MERCHANT_ID),
      CHECKOUTGATEWAY_PAYMENT_KEY: "staging-test-key",
    }),
  /public test merchant/,
);

assert.throws(
  () =>
    resolveCheckoutgatewayCheckoutConfig({
      ...stagingReady,
      APP_ENV: "production",
    }),
  /public test merchant|USD→GEL pricing policy|production API Checkoutgateway callback/,
);

assert.equal(isCheckoutgatewayCheckoutReady({ ...stagingReady, APP_ENV: "production" }), false);

assert.throws(
  () =>
    resolveCheckoutgatewayCheckoutConfig({
      ...productionReady,
      CHECKOUTGATEWAY_DEMO_PRICING_CONFIGURED: false,
    }),
  /USD→GEL pricing policy/,
);

assert.throws(
  () =>
    resolveCheckoutgatewayCheckoutConfig({
      ...productionReady,
      CHECKOUTGATEWAY_CALLBACK_URL: "https://api-staging.example.com/api/billing/checkoutgateway/callback",
      CHECKOUTGATEWAY_RETURN_URL: CHECKOUTGATEWAY_PRODUCTION_RETURN_URL,
    }),
  /localhost or staging|production API Checkoutgateway callback/,
);

assert.throws(
  () =>
    resolveCheckoutgatewayCheckoutConfig({
      ...productionReady,
      CHECKOUTGATEWAY_RETURN_URL: "https://web-staging.example.com/api/payment-return",
    }),
  /localhost or staging|payment-return/,
);

assert.throws(
  () =>
    resolveCheckoutgatewayCheckoutConfig({
      ...productionReady,
      CHECKOUTGATEWAY_CALLBACK_URL: "https://localhost:3001/api/billing/checkoutgateway/callback",
    }),
  /localhost or staging|production API Checkoutgateway callback/,
);

assert.throws(
  () =>
    resolveCheckoutgatewayCheckoutConfig({
      APP_ENV: "production",
      CHECKOUTGATEWAY_ENABLED: true,
      CHECKOUTGATEWAY_MERCHANT_ID: productionReady.CHECKOUTGATEWAY_MERCHANT_ID,
      CHECKOUTGATEWAY_PAYMENT_KEY: productionReady.CHECKOUTGATEWAY_PAYMENT_KEY,
    }),
  /missing: CHECKOUTGATEWAY_CALLBACK_URL, CHECKOUTGATEWAY_RETURN_URL/,
);

const live = resolveCheckoutgatewayCheckoutConfig(productionReady);
assert.ok(live);
assert.equal(live.callbackUrl, CHECKOUTGATEWAY_PRODUCTION_CALLBACK_URL);
assert.equal(live.returnUrl, CHECKOUTGATEWAY_PRODUCTION_RETURN_URL);
assert.equal(live.merchantId, 999000001);
assert.equal(isCheckoutgatewayCheckoutReady(productionReady), true);

console.log("checkoutgateway-config.unit.test.ts: ok");

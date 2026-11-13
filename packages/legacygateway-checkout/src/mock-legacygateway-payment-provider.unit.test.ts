/**
 * Mock LEGACYGATEWAY refund provider scenarios + production mode guard.
 * Run: pnpm --filter @ai-music/legacygateway-checkout exec tsx src/mock-legacygateway-payment-provider.unit.test.ts
 */
import assert from "node:assert/strict";
import {
  buildLegacygatewayRefundMockPayId,
  parseLegacygatewayRefundMockScenario,
} from "@ai-music/shared";
import { MockLegacygatewayPaymentProvider } from "./mock-legacygateway-payment-provider.js";
import { resolveLegacygatewayRefundProviderMode } from "./refund-payment-provider.js";
import { LEGACYGATEWAY_PROVIDER_STATUSES } from "./legacygateway-status.js";
import { LegacygatewayCheckoutError } from "./legacygateway-errors.js";

// PayId encoding
{
  const id = buildLegacygatewayRefundMockPayId("returned", "abc");
  assert.equal(id, "legacygateway-mock:returned:abc");
  assert.equal(parseLegacygatewayRefundMockScenario(id), "returned");
  assert.equal(parseLegacygatewayRefundMockScenario("real-pay-id"), null);
}

// Production mock forbidden
{
  assert.throws(
    () =>
      resolveLegacygatewayRefundProviderMode({
        APP_ENV: "production",
        LEGACYGATEWAY_REFUND_PROVIDER_MODE: "mock",
      }),
    /forbidden when APP_ENV=production/,
  );

  assert.equal(
    resolveLegacygatewayRefundProviderMode({
      APP_ENV: "staging",
      LEGACYGATEWAY_REFUND_PROVIDER_MODE: "mock",
    }),
    "mock",
  );

  assert.equal(
    resolveLegacygatewayRefundProviderMode({
      APP_ENV: "development",
      LEGACYGATEWAY_REFUND_PROVIDER_MODE: "real",
    }),
    "real",
  );
}

async function scenarioReturned(): Promise<void> {
  const mock = new MockLegacygatewayPaymentProvider();
  const payId = buildLegacygatewayRefundMockPayId("returned", "r1");

  const before = await mock.getPaymentDetails(payId);
  assert.equal(before.status, LEGACYGATEWAY_PROVIDER_STATUSES.Succeeded);

  await mock.refund({
    providerPaymentId: payId,
    amount: 29,
    currency: "USD",
    refundRequestId: "req_1",
    partial: false,
  });

  const after = await mock.getPaymentDetails(payId);
  assert.equal(after.status, LEGACYGATEWAY_PROVIDER_STATUSES.Returned);
  assert.equal(mock.refundCalls, 1);
  assert.equal(mock.networkCallsToLegacygatewayBank, 0);
}

async function scenarioAmbiguousThenReturned(): Promise<void> {
  const mock = new MockLegacygatewayPaymentProvider();
  const payId = buildLegacygatewayRefundMockPayId("ambiguous_then_returned", "a1");

  await mock.getPaymentDetails(payId);
  await assert.rejects(
    () =>
      mock.refund({
        providerPaymentId: payId,
        amount: 29,
        currency: "USD",
        refundRequestId: "req_a",
        partial: false,
      }),
    (error: unknown) =>
      error instanceof LegacygatewayCheckoutError && error.kind === "network",
  );

  const after = await mock.getPaymentDetails(payId);
  assert.equal(after.status, LEGACYGATEWAY_PROVIDER_STATUSES.Returned);
  assert.equal(mock.refundCalls, 1);
  assert.equal(mock.networkCallsToLegacygatewayBank, 0);
}

async function scenarioAmbiguousUnresolved(): Promise<void> {
  const mock = new MockLegacygatewayPaymentProvider();
  const payId = buildLegacygatewayRefundMockPayId("ambiguous_unresolved", "u1");

  await mock.getPaymentDetails(payId);
  await assert.rejects(() =>
    mock.refund({
      providerPaymentId: payId,
      amount: 29,
      currency: "USD",
      refundRequestId: "req_u",
      partial: false,
    }),
  );

  const after = await mock.getPaymentDetails(payId);
  assert.equal(after.status, LEGACYGATEWAY_PROVIDER_STATUSES.Succeeded);
  assert.equal(mock.refundCalls, 1);
  assert.equal(mock.networkCallsToLegacygatewayBank, 0);
}

async function scenarioPartial(): Promise<void> {
  const mock = new MockLegacygatewayPaymentProvider();
  const payId = buildLegacygatewayRefundMockPayId("partial_returned", "p1");
  await mock.refund({
    providerPaymentId: payId,
    amount: 10,
    currency: "USD",
    refundRequestId: "req_p",
    partial: true,
  });
  const after = await mock.getPaymentDetails(payId);
  assert.equal(after.status, LEGACYGATEWAY_PROVIDER_STATUSES.PartialReturned);
}

await scenarioReturned();
await scenarioAmbiguousThenReturned();
await scenarioAmbiguousUnresolved();
await scenarioPartial();

console.log("mock-legacygateway-payment-provider.unit.test.ts: ok");

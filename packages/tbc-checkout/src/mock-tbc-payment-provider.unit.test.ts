/**
 * Mock TBC refund provider scenarios + production mode guard.
 * Run: pnpm --filter @ai-music/tbc-checkout exec tsx src/mock-tbc-payment-provider.unit.test.ts
 */
import assert from "node:assert/strict";
import {
  buildTbcRefundMockPayId,
  parseTbcRefundMockScenario,
} from "@ai-music/shared";
import { MockTbcPaymentProvider } from "./mock-tbc-payment-provider.js";
import { resolveTbcRefundProviderMode } from "./refund-payment-provider.js";
import { TBC_PROVIDER_STATUSES } from "./tbc-status.js";
import { TbcCheckoutError } from "./tbc-errors.js";

// PayId encoding
{
  const id = buildTbcRefundMockPayId("returned", "abc");
  assert.equal(id, "tbc-mock:returned:abc");
  assert.equal(parseTbcRefundMockScenario(id), "returned");
  assert.equal(parseTbcRefundMockScenario("real-pay-id"), null);
}

// Production mock forbidden
{
  assert.throws(
    () =>
      resolveTbcRefundProviderMode({
        APP_ENV: "production",
        TBC_REFUND_PROVIDER_MODE: "mock",
      }),
    /forbidden when APP_ENV=production/,
  );

  assert.equal(
    resolveTbcRefundProviderMode({
      APP_ENV: "staging",
      TBC_REFUND_PROVIDER_MODE: "mock",
    }),
    "mock",
  );

  assert.equal(
    resolveTbcRefundProviderMode({
      APP_ENV: "development",
      TBC_REFUND_PROVIDER_MODE: "real",
    }),
    "real",
  );
}

async function scenarioReturned(): Promise<void> {
  const mock = new MockTbcPaymentProvider();
  const payId = buildTbcRefundMockPayId("returned", "r1");

  const before = await mock.getPaymentDetails(payId);
  assert.equal(before.status, TBC_PROVIDER_STATUSES.Succeeded);

  await mock.refund({
    providerPaymentId: payId,
    amount: 29,
    currency: "USD",
    refundRequestId: "req_1",
    partial: false,
  });

  const after = await mock.getPaymentDetails(payId);
  assert.equal(after.status, TBC_PROVIDER_STATUSES.Returned);
  assert.equal(mock.refundCalls, 1);
  assert.equal(mock.networkCallsToTbcBank, 0);
}

async function scenarioAmbiguousThenReturned(): Promise<void> {
  const mock = new MockTbcPaymentProvider();
  const payId = buildTbcRefundMockPayId("ambiguous_then_returned", "a1");

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
      error instanceof TbcCheckoutError && error.kind === "network",
  );

  const after = await mock.getPaymentDetails(payId);
  assert.equal(after.status, TBC_PROVIDER_STATUSES.Returned);
  assert.equal(mock.refundCalls, 1);
  assert.equal(mock.networkCallsToTbcBank, 0);
}

async function scenarioAmbiguousUnresolved(): Promise<void> {
  const mock = new MockTbcPaymentProvider();
  const payId = buildTbcRefundMockPayId("ambiguous_unresolved", "u1");

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
  assert.equal(after.status, TBC_PROVIDER_STATUSES.Succeeded);
  assert.equal(mock.refundCalls, 1);
  assert.equal(mock.networkCallsToTbcBank, 0);
}

async function scenarioPartial(): Promise<void> {
  const mock = new MockTbcPaymentProvider();
  const payId = buildTbcRefundMockPayId("partial_returned", "p1");
  await mock.refund({
    providerPaymentId: payId,
    amount: 10,
    currency: "USD",
    refundRequestId: "req_p",
    partial: true,
  });
  const after = await mock.getPaymentDetails(payId);
  assert.equal(after.status, TBC_PROVIDER_STATUSES.PartialReturned);
}

await scenarioReturned();
await scenarioAmbiguousThenReturned();
await scenarioAmbiguousUnresolved();
await scenarioPartial();

console.log("mock-tbc-payment-provider.unit.test.ts: ok");

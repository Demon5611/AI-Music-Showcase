import assert from "node:assert/strict";
import { mapCheckoutgatewayOrderStatus, mapCheckoutgatewayReverseStatus } from "./checkoutgateway-status.js";

assert.deepEqual(mapCheckoutgatewayOrderStatus("approved"), {
  domainStatus: "paid",
  normalizedStatus: "succeeded",
  mayGrantCredits: true,
  known: true,
});
assert.equal(mapCheckoutgatewayOrderStatus("created").mayGrantCredits, false);
assert.equal(mapCheckoutgatewayOrderStatus("processing").mayGrantCredits, false);
assert.equal(mapCheckoutgatewayOrderStatus("declined").mayGrantCredits, false);
assert.equal(mapCheckoutgatewayOrderStatus("expired").mayGrantCredits, false);
assert.equal(mapCheckoutgatewayOrderStatus("reversed").mayGrantCredits, false);
assert.equal(mapCheckoutgatewayOrderStatus("weird").known, false);
assert.equal(mapCheckoutgatewayOrderStatus("weird").mayGrantCredits, false);
assert.equal(mapCheckoutgatewayReverseStatus("approved"), "approved");
assert.equal(mapCheckoutgatewayReverseStatus("declined"), "declined");
assert.equal(mapCheckoutgatewayReverseStatus("pending"), "unknown");

console.log("checkoutgateway-status.unit.test.ts: ok");

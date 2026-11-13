import assert from "node:assert/strict";
import {
  parseCheckoutPaymentProvider,
} from "./payment-provider.js";

assert.equal(parseCheckoutPaymentProvider("checkoutgateway"), "checkoutgateway");
assert.equal(parseCheckoutPaymentProvider(" checkoutgateway "), "checkoutgateway");
assert.equal(parseCheckoutPaymentProvider("LEGACYGATEWAY"), null);
assert.equal(parseCheckoutPaymentProvider("legacygateway"), null);
assert.equal(parseCheckoutPaymentProvider(undefined), null);
assert.equal(parseCheckoutPaymentProvider(""), null);
assert.equal(parseCheckoutPaymentProvider("stripe"), null);

console.log("payment-provider.test.ts: ok");

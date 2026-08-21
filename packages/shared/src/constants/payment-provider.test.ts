import assert from "node:assert/strict";
import {
  parseCheckoutPaymentProvider,
} from "./payment-provider.js";

assert.equal(parseCheckoutPaymentProvider("flitt"), "flitt");
assert.equal(parseCheckoutPaymentProvider(" flitt "), "flitt");
assert.equal(parseCheckoutPaymentProvider("TBC"), null);
assert.equal(parseCheckoutPaymentProvider("tbc"), null);
assert.equal(parseCheckoutPaymentProvider(undefined), null);
assert.equal(parseCheckoutPaymentProvider(""), null);
assert.equal(parseCheckoutPaymentProvider("stripe"), null);

console.log("payment-provider.test.ts: ok");

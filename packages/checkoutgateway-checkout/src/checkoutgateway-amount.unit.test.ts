import assert from "node:assert/strict";
import { CheckoutgatewayCheckoutError } from "./checkoutgateway-errors.js";
import {
  fromCheckoutgatewayMinorUnits,
  majorStringToCheckoutgatewayMinorUnits,
  parseCheckoutgatewayAmountField,
  toCheckoutgatewayMinorUnits,
} from "./checkoutgateway-amount.js";

assert.equal(toCheckoutgatewayMinorUnits(9), 900);
assert.equal(toCheckoutgatewayMinorUnits(29), 2900);
assert.equal(toCheckoutgatewayMinorUnits(99), 9900);
assert.equal(toCheckoutgatewayMinorUnits(9.5), 950);
assert.equal(majorStringToCheckoutgatewayMinorUnits("78.88"), 7888);
assert.equal(majorStringToCheckoutgatewayMinorUnits("29"), 2900);
assert.equal(majorStringToCheckoutgatewayMinorUnits("3"), 300);

assert.equal(parseCheckoutgatewayAmountField("200"), 200);
assert.equal(parseCheckoutgatewayAmountField(200), 200);
assert.equal(parseCheckoutgatewayAmountField(""), null);
assert.equal(parseCheckoutgatewayAmountField(null), null);

assert.throws(() => toCheckoutgatewayMinorUnits(0), CheckoutgatewayCheckoutError);
assert.throws(() => toCheckoutgatewayMinorUnits(-1), CheckoutgatewayCheckoutError);
assert.throws(() => toCheckoutgatewayMinorUnits(9.001), CheckoutgatewayCheckoutError);

console.log("checkoutgateway-amount.unit.test.ts: ok");

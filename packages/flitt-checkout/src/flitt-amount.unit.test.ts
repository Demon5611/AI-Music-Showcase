import assert from "node:assert/strict";
import { FlittCheckoutError } from "./flitt-errors.js";
import {
  fromFlittMinorUnits,
  majorStringToFlittMinorUnits,
  parseFlittAmountField,
  toFlittMinorUnits,
} from "./flitt-amount.js";

assert.equal(toFlittMinorUnits(9), 900);
assert.equal(toFlittMinorUnits(29), 2900);
assert.equal(toFlittMinorUnits(99), 9900);
assert.equal(toFlittMinorUnits(9.5), 950);
assert.equal(majorStringToFlittMinorUnits("78.88"), 7888);
assert.equal(majorStringToFlittMinorUnits("29"), 2900);
assert.equal(majorStringToFlittMinorUnits("3"), 300);

assert.equal(parseFlittAmountField("200"), 200);
assert.equal(parseFlittAmountField(200), 200);
assert.equal(parseFlittAmountField(""), null);
assert.equal(parseFlittAmountField(null), null);

assert.throws(() => toFlittMinorUnits(0), FlittCheckoutError);
assert.throws(() => toFlittMinorUnits(-1), FlittCheckoutError);
assert.throws(() => toFlittMinorUnits(9.001), FlittCheckoutError);

console.log("flitt-amount.unit.test.ts: ok");

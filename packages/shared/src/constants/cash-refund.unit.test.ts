import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeCumulativeCashRefundMinor,
  majorDecimalStringToMinorUnits,
  minorUnitsToMajorDecimalString,
} from "./cash-refund.js";

describe("computeCumulativeCashRefundMinor", () => {
  const original = majorDecimalStringToMinorUnits("23.52"); // 2352
  const grant = 500_000;

  it("full pack refund equals original captured amount", () => {
    const result = computeCumulativeCashRefundMinor({
      originalAmountMinor: original,
      grantedCreditUnits: grant,
      alreadyRefundedCreditUnits: 0,
      thisRefundCreditUnits: 500_000,
    });
    assert.equal(result.incrementalRefundMinor, 2352n);
    assert.equal(result.targetRefundedMinor, 2352n);
  });

  it("purchase remainder 310/500 of 23.52 GEL → 14.58 GEL", () => {
    const result = computeCumulativeCashRefundMinor({
      originalAmountMinor: original,
      grantedCreditUnits: grant,
      alreadyRefundedCreditUnits: 0,
      thisRefundCreditUnits: 310_000,
    });
    // 2352 * 310000 / 500000 = 1458.24 → round half up 1458
    assert.equal(result.incrementalRefundMinor, 1458n);
    assert.equal(minorUnitsToMajorDecimalString(result.incrementalRefundMinor), "14.58");
  });

  it("operation 80/500 of 23.52 GEL → 3.76 GEL", () => {
    const result = computeCumulativeCashRefundMinor({
      originalAmountMinor: original,
      grantedCreditUnits: grant,
      alreadyRefundedCreditUnits: 0,
      thisRefundCreditUnits: 80_000,
    });
    // 2352 * 80000 / 500000 = 376.32 → 376
    assert.equal(result.incrementalRefundMinor, 376n);
    assert.equal(minorUnitsToMajorDecimalString(result.incrementalRefundMinor), "3.76");
  });

  it("operation then remainder never exceeds original", () => {
    const op = computeCumulativeCashRefundMinor({
      originalAmountMinor: original,
      grantedCreditUnits: grant,
      alreadyRefundedCreditUnits: 0,
      thisRefundCreditUnits: 80_000,
    });
    const rem = computeCumulativeCashRefundMinor({
      originalAmountMinor: original,
      grantedCreditUnits: grant,
      alreadyRefundedCreditUnits: 80_000,
      thisRefundCreditUnits: 310_000,
    });
    assert.equal(op.incrementalRefundMinor + rem.incrementalRefundMinor, rem.targetRefundedMinor);
    assert.ok(rem.targetRefundedMinor <= original);

    const rest = computeCumulativeCashRefundMinor({
      originalAmountMinor: original,
      grantedCreditUnits: grant,
      alreadyRefundedCreditUnits: 390_000,
      thisRefundCreditUnits: 110_000,
    });
    assert.equal(rest.targetRefundedMinor, original);
  });

  it("many 1-unit refunds never exceed original and finish exact", () => {
    let already = 0;
    let sum = 0n;
    const step = 1_000; // 1 display credit
    while (already < grant) {
      const take = Math.min(step, grant - already);
      const part = computeCumulativeCashRefundMinor({
        originalAmountMinor: original,
        grantedCreditUnits: grant,
        alreadyRefundedCreditUnits: already,
        thisRefundCreditUnits: take,
      });
      sum += part.incrementalRefundMinor;
      already += take;
      assert.ok(sum <= original);
    }
    assert.equal(already, grant);
    assert.equal(sum, original);
  });
});

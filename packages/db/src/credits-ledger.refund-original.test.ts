import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPgTrue, resolveOriginalSpendRefundUnits } from "./credits-ledger.js";

describe("isPgTrue", () => {
  it("accepts postgres/prisma boolean encodings for try-lock", () => {
    assert.equal(isPgTrue(true), true);
    assert.equal(isPgTrue(1), true);
    assert.equal(isPgTrue(1n), true);
    assert.equal(isPgTrue("t"), true);
    assert.equal(isPgTrue("true"), true);
    assert.equal(isPgTrue(false), false);
    assert.equal(isPgTrue(0), false);
    assert.equal(isPgTrue("f"), false);
    assert.equal(isPgTrue(undefined), false);
  });
});

describe("resolveOriginalSpendRefundUnits", () => {
  it("refunds original lyrics spend after price rises from 0.4 to 1 credit", () => {
    // Historical spend: 0.4 credits = 400 units (signed negative on ledger).
    const oldSpendUnits = -400;
    // Current SoT lyrics price: 1 credit = 1000 units.
    const currentLyricsUnits = 1_000;

    assert.equal(resolveOriginalSpendRefundUnits(oldSpendUnits), 400);
    assert.notEqual(
      resolveOriginalSpendRefundUnits(oldSpendUnits),
      currentLyricsUnits,
    );
  });

  it("refunds original stem spend after price rises from 10 to 12 credits", () => {
    const oldSpendUnits = -10_000;
    const currentStemUnits = 12_000;

    assert.equal(resolveOriginalSpendRefundUnits(oldSpendUnits), 10_000);
    assert.notEqual(
      resolveOriginalSpendRefundUnits(oldSpendUnits),
      currentStemUnits,
    );
  });

  it("returns null when spend row is missing or not a debit", () => {
    assert.equal(resolveOriginalSpendRefundUnits(null), null);
    assert.equal(resolveOriginalSpendRefundUnits(undefined), null);
    assert.equal(resolveOriginalSpendRefundUnits(400), null);
    assert.equal(resolveOriginalSpendRefundUnits(0), null);
  });
});

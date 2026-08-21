import assert from "node:assert/strict";
import {
  FxConversionError,
  convertUsdMajorToGel,
  dividePositiveDecimalByInteger,
  gelTetriToMajorString,
  roundHalfUpDivide,
} from "./usd-gel.js";
import {
  StaticUsdGelFxProvider,
  UnconfiguredUsdGelFxProvider,
  createTestUsdGelQuote,
  quoteUsdToGel,
} from "./fx-rate-provider.js";

const creator = convertUsdMajorToGel("29", "2.72");
assert.equal(creator.gelMajor, "78.88");
assert.equal(creator.gelTetri, 7888);
assert.equal(gelTetriToMajorString(7888), "78.88");

assert.deepEqual(convertUsdMajorToGel(29, "2.7200"), { gelMajor: "78.88", gelTetri: 7888 });
assert.deepEqual(convertUsdMajorToGel("9", "2.72"), { gelMajor: "24.48", gelTetri: 2448 });
assert.deepEqual(convertUsdMajorToGel("99", "2.72"), { gelMajor: "269.28", gelTetri: 26928 });

// 29 × 2.721 = 78.909 → 78.91 GEL / 7891 tetri
assert.deepEqual(convertUsdMajorToGel("29", "2.721"), { gelMajor: "78.91", gelTetri: 7891 });

// half-up: $1 × 1.005 = 1.005 → 1.01 GEL / 101 tetri
assert.deepEqual(convertUsdMajorToGel("1", "1.005"), { gelMajor: "1.01", gelTetri: 101 });

assert.equal(dividePositiveDecimalByInteger("26.30", 10), "2.63");
assert.equal(dividePositiveDecimalByInteger("2.6300", 1), "2.63");
assert.equal(roundHalfUpDivide(1500n, 1000n), 2n);
assert.equal(roundHalfUpDivide(1499n, 1000n), 1n);

assert.throws(() => convertUsdMajorToGel("29", "0"), FxConversionError);
assert.throws(() => convertUsdMajorToGel("29.001", "2.72"), FxConversionError);
assert.throws(() => convertUsdMajorToGel("-29", "2.72"), FxConversionError);

{
  const provider = new StaticUsdGelFxProvider(createTestUsdGelQuote("2.72"));
  const quoted = await quoteUsdToGel(provider, "29");
  assert.equal(quoted.charge.gelTetri, 7888);
  assert.equal(quoted.quote.source, "test-static");
  assert.equal(quoted.quote.baseCurrency, "USD");
  assert.equal(quoted.quote.quoteCurrency, "GEL");
}

await assert.rejects(
  () => new UnconfiguredUsdGelFxProvider().getUsdGelQuote(),
  /not configured/,
);

console.log("usd-gel-fx.test.ts: ok");

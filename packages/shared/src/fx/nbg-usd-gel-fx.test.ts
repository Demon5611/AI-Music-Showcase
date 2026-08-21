import assert from "node:assert/strict";
import { convertUsdMajorToGel, dividePositiveDecimalByInteger } from "./usd-gel.js";
import {
  createUsdGelFxProvider,
  resolveUsdGelFxProviderId,
} from "./create-usd-gel-fx-provider.js";
import { FxQuoteUnavailableError, UnconfiguredUsdGelFxProvider } from "./fx-rate-provider.js";
import {
  NBG_USD_GEL_URL,
  NbgUsdGelFxProvider,
  isNbgBulletinFresh,
  parseNbgUsdGelQuote,
} from "./nbg-usd-gel.js";

function bulletin(overrides?: {
  code?: string;
  quantity?: number | string;
  rateFormated?: string | null;
  validFromDate?: string;
  currencies?: unknown;
}): unknown {
  const row = {
    code: overrides?.code ?? "USD",
    quantity: overrides?.quantity ?? 1,
    rateFormated: overrides?.rateFormated === undefined ? "2.6300" : overrides.rateFormated,
    date: "2026-08-19T17:01:00.084Z",
    validFromDate: overrides?.validFromDate ?? "2026-08-20T00:00:00.000Z",
  };
  return [
    {
      date: "2026-08-20T00:00:00.000Z",
      currencies: overrides?.currencies ?? [row],
    },
  ];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const nowWednesday = new Date("2026-08-19T12:00:00.000Z"); // 16:00 Tbilisi
const nowThursday = new Date("2026-08-20T10:00:00.000Z");

{
  const quote = parseNbgUsdGelQuote(bulletin(), nowThursday);
  assert.equal(quote.source, "nbg");
  assert.equal(quote.baseCurrency, "USD");
  assert.equal(quote.quoteCurrency, "GEL");
  assert.equal(quote.rate, "2.63");
  assert.equal(quote.quotedAt.toISOString(), "2026-08-20T00:00:00.000Z");
}

{
  const quote = parseNbgUsdGelQuote(
    bulletin({ quantity: 10, rateFormated: "26.30" }),
    nowThursday,
  );
  assert.equal(quote.rate, "2.63");
  assert.equal(dividePositiveDecimalByInteger("26.30", 10), "2.63");
}

{
  const charge = convertUsdMajorToGel("29", "2.63");
  assert.equal(charge.gelMajor, "76.27");
  assert.equal(charge.gelTetri, 7627);
}

await assert.throws(
  () => parseNbgUsdGelQuote(bulletin({ currencies: [{ code: "EUR", quantity: 1, rateFormated: "3.00", validFromDate: "2026-08-20T00:00:00.000Z" }] }), nowThursday),
  FxQuoteUnavailableError,
);

await assert.throws(
  () => parseNbgUsdGelQuote(bulletin({ rateFormated: "not-a-rate" }), nowThursday),
  /malformed|Invalid FX rate/,
);

{
  let calls = 0;
  const provider = new NbgUsdGelFxProvider({
    now: () => nowThursday,
    fetchImpl: async (url) => {
      assert.equal(url, NBG_USD_GEL_URL);
      calls += 1;
      if (calls === 1) {
        return jsonResponse(bulletin(), 500);
      }
      return jsonResponse(bulletin());
    },
  });
  const quote = await provider.getUsdGelQuote();
  assert.equal(quote.rate, "2.63");
  assert.equal(calls, 2);
}

{
  const provider = new NbgUsdGelFxProvider({
    now: () => nowThursday,
    timeoutMs: 20,
    fetchImpl: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
  });
  await assert.rejects(() => provider.getUsdGelQuote(), /timed out|unavailable/);
}

{
  let calls = 0;
  const provider = new NbgUsdGelFxProvider({
    now: () => nowThursday,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse(bulletin());
    },
  });
  const first = await provider.getUsdGelQuote();
  const second = await provider.getUsdGelQuote();
  assert.equal(calls, 1);
  assert.equal(first.rate, second.rate);
  assert.equal(first.source, "nbg");
}

{
  let nowMs = nowThursday.getTime();
  let calls = 0;
  const provider = new NbgUsdGelFxProvider({
    cacheTtlMs: 60 * 60 * 1000,
    now: () => new Date(nowMs),
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse(bulletin());
      }
      throw new TypeError("network down");
    },
  });
  await provider.getUsdGelQuote();
  nowMs += 2 * 60 * 60 * 1000;
  await assert.rejects(() => provider.getUsdGelQuote(), FxQuoteUnavailableError);
  assert.equal(calls, 3);
}

{
  assert.equal(
    isNbgBulletinFresh(new Date("2026-08-21T00:00:00.000Z"), new Date("2026-08-22T12:00:00.000Z")),
    true,
    "Friday bulletin remains fresh on Saturday in Tbilisi",
  );
  assert.equal(
    isNbgBulletinFresh(new Date("2026-08-21T00:00:00.000Z"), new Date("2026-08-24T08:00:00.000Z")),
    true,
    "Friday bulletin remains fresh on Monday",
  );
  assert.equal(
    isNbgBulletinFresh(new Date("2026-08-21T00:00:00.000Z"), new Date("2026-08-20T12:00:00.000Z")),
    true,
    "already-published next-day bulletin is acceptable",
  );
  assert.equal(
    isNbgBulletinFresh(new Date("2026-08-01T00:00:00.000Z"), nowThursday),
    false,
  );
  assert.throws(
    () => parseNbgUsdGelQuote(bulletin({ validFromDate: "2026-08-01T00:00:00.000Z" }), nowThursday),
    /not fresh/,
  );
}

{
  const productionFake = createUsdGelFxProvider({
    APP_ENV: "production",
    FX_USD_GEL_PROVIDER: "static",
  });
  assert.equal(productionFake instanceof UnconfiguredUsdGelFxProvider, true);
  assert.equal(
    resolveUsdGelFxProviderId({ APP_ENV: "production", FX_USD_GEL_PROVIDER: "nbg" }),
    "nbg",
  );
  assert.equal(
    resolveUsdGelFxProviderId({ APP_ENV: "production" }),
    "unconfigured",
  );
  await assert.rejects(() => productionFake.getUsdGelQuote(), /not configured/);
}

{
  const provider = new NbgUsdGelFxProvider({
    now: () => nowWednesday,
    fetchImpl: async () => jsonResponse(bulletin({ validFromDate: "2026-08-19T00:00:00.000Z" })),
  });
  const quote = await provider.getUsdGelQuote();
  assert.equal(quote.source, "nbg");
}

console.log("nbg-usd-gel-fx.test.ts: ok");

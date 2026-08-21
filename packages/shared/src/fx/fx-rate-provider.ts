import {
  assertUsdGelQuote,
  convertUsdMajorToGel,
  type ConvertedGelCharge,
  type FxQuote,
} from "./usd-gel.js";

export interface FxRateProvider {
  getUsdGelQuote(): Promise<FxQuote>;
}

export class FxQuoteUnavailableError extends Error {
  readonly code = "FX_QUOTE_UNAVAILABLE";

  constructor(message = "USD/GEL FX quote is unavailable") {
    super(message);
    this.name = "FxQuoteUnavailableError";
  }
}

/** Production/staging default: fail closed until a real FX source is wired. */
export class UnconfiguredUsdGelFxProvider implements FxRateProvider {
  async getUsdGelQuote(): Promise<FxQuote> {
    throw new FxQuoteUnavailableError("USD/GEL FX source is not configured");
  }
}

export class StaticUsdGelFxProvider implements FxRateProvider {
  constructor(private readonly quote: FxQuote) {
    assertUsdGelQuote(quote);
  }

  async getUsdGelQuote(): Promise<FxQuote> {
    return {
      ...this.quote,
      quotedAt: new Date(this.quote.quotedAt.getTime()),
    };
  }
}

export function createTestUsdGelQuote(rate = "2.72"): FxQuote {
  return {
    baseCurrency: "USD",
    quoteCurrency: "GEL",
    rate,
    quotedAt: new Date("2026-08-19T00:00:00.000Z"),
    source: "test-static",
  };
}

export async function quoteUsdToGel(
  provider: FxRateProvider,
  usdMajor: string | number,
): Promise<{ quote: FxQuote; charge: ConvertedGelCharge }> {
  const quote = assertUsdGelQuote(await provider.getUsdGelQuote());
  return {
    quote,
    charge: convertUsdMajorToGel(usdMajor, quote.rate),
  };
}

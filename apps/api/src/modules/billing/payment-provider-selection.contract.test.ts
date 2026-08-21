/**
 * Flitt-only new checkout. TBC env must not enable CTA or create purchases.
 * Historical TBC refunds still route by stored provider.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/billing/payment-provider-selection.contract.test.ts
 */
import assert from "node:assert/strict";
import { Prisma, type CreditPackPurchase } from "@ai-music/db";
import { FLITT_PAYMENT_PROVIDER, TBC_PAYMENT_PROVIDER, createTestUsdGelQuote } from "@ai-music/shared";
import {
  createCreditPackCheckout,
  getCreditPackCheckoutStatus,
} from "./credit-pack-checkout.service.js";
import { resolveMonetaryRefundEnqueueTarget } from "./refund.service.js";
import {
  isConfiguredCheckoutEnabled,
  resolveConfiguredCheckoutProvider,
} from "./payment-provider-selection.js";
import { applyFetchedTbcPayment, handleTbcCallback } from "./tbc-payment-fulfillment.service.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const FLITT_READY = {
  PAYMENT_PROVIDER: "flitt",
  APP_ENV: "staging",
  FLITT_ENABLED: true,
  FLITT_API_BASE_URL: "https://pay.flitt.com",
  FLITT_MERCHANT_ID: "1549901",
  FLITT_PAYMENT_KEY: "staging-test-key",
  FLITT_CURRENCY: "GEL",
  FLITT_CALLBACK_URL: "https://api.example.com/api/billing/flitt/callback",
  FLITT_RETURN_URL: "https://web.example.com/pricing",
};

const TBC_CREDENTIALS = {
  TBC_CHECKOUT_ENABLED: true,
  TBC_API_BASE_URL: "https://api.tbcbank.ge",
  TBC_CHECKOUT_API_VERSION: "v1",
  TBC_API_KEY: "test-api-key",
  TBC_CLIENT_ID: "test-client-id",
  TBC_CLIENT_SECRET: "test-client-secret",
  TBC_CHECKOUT_CURRENCY: "USD",
  TBC_CALLBACK_URL: "https://api.example.com/api/billing/tbc/callback",
  TBC_RETURN_URL: "https://example.com/pricing",
};

const TBC_READY = {
  PAYMENT_PROVIDER: "tbc",
  ...TBC_CREDENTIALS,
};

const FLITT_CONFIG = {
  enabled: true,
  apiBaseUrl: "https://pay.flitt.com",
  merchantId: 1_549_901,
  paymentKey: "staging-test-key",
  currency: "GEL" as const,
  callbackUrl: FLITT_READY.FLITT_CALLBACK_URL,
  returnUrl: FLITT_READY.FLITT_RETURN_URL,
};

const FLITT_INCOMPLETE = {
  PAYMENT_PROVIDER: "flitt",
  APP_ENV: "staging",
  FLITT_ENABLED: true,
  ...TBC_CREDENTIALS,
};

assert.equal(resolveConfiguredCheckoutProvider(FLITT_READY), "flitt");
assert.equal(isConfiguredCheckoutEnabled(FLITT_READY), true);
assert.deepEqual(getCreditPackCheckoutStatus(FLITT_READY), { checkoutEnabled: true });

assert.deepEqual(
  getCreditPackCheckoutStatus({
    ...FLITT_READY,
    PAYMENT_PROVIDER: undefined,
  }),
  { checkoutEnabled: true },
  "unset PAYMENT_PROVIDER + Flitt ready → checkout enabled",
);

assert.deepEqual(getCreditPackCheckoutStatus(FLITT_INCOMPLETE), { checkoutEnabled: false });
assert.deepEqual(
  getCreditPackCheckoutStatus({
    PAYMENT_PROVIDER: "flitt",
    FLITT_ENABLED: false,
    ...TBC_CREDENTIALS,
  }),
  { checkoutEnabled: false },
);

assert.deepEqual(
  getCreditPackCheckoutStatus(TBC_READY),
  { checkoutEnabled: false },
  "TBC env must not enable CTA",
);

assert.deepEqual(
  getCreditPackCheckoutStatus({
    ...FLITT_READY,
    PAYMENT_PROVIDER: "tbc",
    ...TBC_CREDENTIALS,
  }),
  { checkoutEnabled: false },
  "PAYMENT_PROVIDER=tbc fails closed even if Flitt is ready",
);

assert.deepEqual(
  getCreditPackCheckoutStatus({
    ...FLITT_READY,
    PAYMENT_PROVIDER: "stripe",
  }),
  { checkoutEnabled: false },
  "unknown PAYMENT_PROVIDER fails closed",
);

assert.deepEqual(
  getCreditPackCheckoutStatus({
    PAYMENT_PROVIDER: undefined,
    ...TBC_CREDENTIALS,
  }),
  { checkoutEnabled: false },
  "TBC ready without Flitt → checkout disabled",
);

function createCheckoutDb() {
  const purchases = new Map<string, CreditPackPurchase>();
  return {
    purchases,
    creditPackPurchase: {
      async findUnique(args: {
        where: { userId_clientRequestId?: { userId: string; clientRequestId: string } };
      }) {
        const key = args.where.userId_clientRequestId;
        if (!key) return null;
        for (const row of purchases.values()) {
          if (row.userId === key.userId && row.clientRequestId === key.clientRequestId) {
            return row;
          }
        }
        return null;
      },
      async create(args: { data: Record<string, unknown> }) {
        const row = {
          ...(args.data as object),
          priceAmount: new Prisma.Decimal(String(args.data.priceAmount)),
          createdAt: new Date(),
          updatedAt: new Date(),
          providerPaymentId: null,
          providerStatus: null,
          approvalUrl: null,
          paidAt: null,
          creditedAt: null,
          failureCode: null,
          failureMessage: null,
          metadata: null,
        } as CreditPackPurchase;
        purchases.set(row.id, row);
        return row;
      },
      async update(args: { where: { id: string }; data: Partial<CreditPackPurchase> }) {
        const row = purchases.get(args.where.id)!;
        const next = { ...row, ...args.data, updatedAt: new Date() } as CreditPackPurchase;
        purchases.set(args.where.id, next);
        return next;
      },
    },
  };
}

{
  const db = createCheckoutDb();
  let flittCreates = 0;
  let capturedReturnUrl = "";

  const result = await createCreditPackCheckout(
    "user-1",
    { packageId: "creator" },
    {
      env: { ...FLITT_READY, ...TBC_CREDENTIALS },
      prismaClient: db as never,
      resolveFlittConfig: () => FLITT_CONFIG,
      getUsdGelQuote: async () => createTestUsdGelQuote("2.72"),
      createFlittProvider: () =>
        ({
          createCheckout: async (input: { returnUrl: string; amountMinor: number; currency: string }) => {
            flittCreates += 1;
            capturedReturnUrl = input.returnUrl;
            assert.equal(input.amountMinor, 7888);
            assert.equal(input.currency, "GEL");
            return {
              provider: FLITT_PAYMENT_PROVIDER,
              providerPaymentId: "805230052",
              approvalUrl: "https://pay.flitt.com/merchants/x/default/index.html?token=1",
              providerStatus: "created",
            };
          },
        }) as never,
      createIdFn: () => "purchase-flitt-ready",
    },
  );

  assert.equal(result.currency, "GEL");
  assert.equal(result.priceAmount, 78.88);
  assert.equal(flittCreates, 1);
  assert.equal(db.purchases.get("purchase-flitt-ready")?.provider, FLITT_PAYMENT_PROVIDER);
  assert.equal(
    capturedReturnUrl,
    "https://web.example.com/pricing?purchaseId=purchase-flitt-ready",
  );
}

{
  const db = createCheckoutDb();
  let flittCreates = 0;

  const result = await createCreditPackCheckout(
    "user-1",
    { packageId: "creator" },
    {
      env: { ...FLITT_READY, PAYMENT_PROVIDER: undefined, ...TBC_CREDENTIALS },
      prismaClient: db as never,
      resolveFlittConfig: () => FLITT_CONFIG,
      getUsdGelQuote: async () => createTestUsdGelQuote("2.72"),
      createFlittProvider: () =>
        ({
          createCheckout: async () => {
            flittCreates += 1;
            return {
              provider: FLITT_PAYMENT_PROVIDER,
              providerPaymentId: "805230053",
              approvalUrl: "https://pay.flitt.com/merchants/x/default/index.html?token=2",
              providerStatus: "created",
            };
          },
        }) as never,
      createIdFn: () => "purchase-flitt-unset-selector",
    },
  );

  assert.equal(flittCreates, 1);
  assert.equal(db.purchases.get("purchase-flitt-unset-selector")?.provider, FLITT_PAYMENT_PROVIDER);
  assert.equal(result.purchaseId, "purchase-flitt-unset-selector");
}

{
  const db = createCheckoutDb();

  await assert.rejects(
    () =>
      createCreditPackCheckout(
        "user-1",
        { packageId: "creator" },
        {
          env: TBC_READY,
          prismaClient: db as never,
          resolveFlittConfig: () => FLITT_CONFIG,
          createFlittProvider: () =>
            ({
              createCheckout: async () => {
                throw new Error("TBC must not be selected for new purchase");
              },
            }) as never,
          createIdFn: () => "purchase-tbc-blocked",
        },
      ),
  );

  assert.equal(db.purchases.size, 0);
}

{
  const db = createCheckoutDb();

  await assert.rejects(() =>
    createCreditPackCheckout("user-1", { packageId: "creator" }, {
      env: { PAYMENT_PROVIDER: "flitt", FLITT_ENABLED: false, ...TBC_CREDENTIALS },
      prismaClient: db as never,
      createIdFn: () => "purchase-flitt-disabled",
    }),
  );

  assert.equal(db.purchases.size, 0);
}

{
  const db = createCheckoutDb();
  const historical = {
    id: "purchase-tbc-historical",
    userId: "user-1",
    provider: TBC_PAYMENT_PROVIDER,
    packageId: "creator",
    priceAmount: new Prisma.Decimal(29),
    currency: "USD",
    creditsAmount: 2000,
    merchantPaymentId: "purchase-tbc-historical",
    providerPaymentId: "pay-tbc-1",
    status: "provider_created",
    providerStatus: "Created",
    approvalUrl: "https://tpay.example/approve-legacy",
    clientRequestId: "same-key-legacy",
    paidAt: null,
    creditedAt: null,
    failureCode: null,
    failureMessage: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as CreditPackPurchase;
  db.purchases.set(historical.id, historical);

  await assert.rejects(
    () =>
      createCreditPackCheckout(
        "user-1",
        { packageId: "creator", clientRequestId: "same-key-legacy" },
        {
          env: FLITT_READY,
          prismaClient: db as never,
          resolveFlittConfig: () => FLITT_CONFIG,
          createFlittProvider: () =>
            ({
              createCheckout: async () => {
                throw new Error("must not create Flitt over historical TBC idempotency key");
              },
            }) as never,
          createIdFn: () => "purchase-should-not-exist",
        },
      ),
    (error: unknown) =>
      error instanceof Error && (error as { code?: string }).code === "CHECKOUT_IN_PROGRESS",
  );

  assert.equal(db.purchases.size, 1);
  assert.equal(db.purchases.get("purchase-tbc-historical")?.provider, TBC_PAYMENT_PROVIDER);
}

{
  const previous = process.env.PAYMENT_PROVIDER;
  try {
    process.env.PAYMENT_PROVIDER = "tbc";
    assert.equal(resolveMonetaryRefundEnqueueTarget("flitt"), FLITT_PAYMENT_PROVIDER);
    process.env.PAYMENT_PROVIDER = "flitt";
    assert.equal(resolveMonetaryRefundEnqueueTarget("tbc"), TBC_PAYMENT_PROVIDER);
  } finally {
    if (previous === undefined) {
      delete process.env.PAYMENT_PROVIDER;
    } else {
      process.env.PAYMENT_PROVIDER = previous;
    }
  }

  const refundService = readFileSync(join(here, "refund.service.ts"), "utf8");
  assert.match(refundService, /storedProvider === FLITT_PAYMENT_PROVIDER/);
  assert.match(refundService, /storedProvider === TBC_PAYMENT_PROVIDER/);
  assert.match(refundService, /provider: storedProvider/);
  assert.match(refundService, /refundable\.provider/);
  assert.doesNotMatch(refundService, /process\.env\.PAYMENT_PROVIDER/);
  assert.doesNotMatch(refundService, /resolveConfiguredCheckoutProvider/);
}

{
  const checkout = readFileSync(join(here, "credit-pack-checkout.service.ts"), "utf8");
  assert.doesNotMatch(checkout, /TBC_CHECKOUT_EXPIRATION_MINUTES/);
  assert.doesNotMatch(checkout, /provider: TBC_PAYMENT_PROVIDER/);
  assert.doesNotMatch(checkout, /isTbcCheckoutReady/);
  assert.doesNotMatch(checkout, /new TbcCheckoutClient/);
}

{
  const selection = readFileSync(join(here, "payment-provider-selection.ts"), "utf8");
  assert.doesNotMatch(selection, /isTbcCheckoutReady/);
}

{
  const routes = readFileSync(join(here, "routes.ts"), "utf8");
  assert.match(routes, /LEGACY ONLY/);
  assert.match(routes, /@deprecated/);
}

{
  const flittPurchase = {
    id: "p-flitt-shared-payid",
    userId: "user-1",
    provider: FLITT_PAYMENT_PROVIDER,
    packageId: "creator",
    priceAmount: new Prisma.Decimal(29),
    currency: "GEL",
    creditsAmount: 2000,
    merchantPaymentId: "p-flitt-shared-payid",
    providerPaymentId: "shared-pay-id",
    status: "provider_created",
    providerStatus: "created",
    approvalUrl: "https://pay.flitt.com/merchants/x/default/index.html?token=1",
    clientRequestId: null,
    paidAt: null,
    creditedAt: null,
    failureCode: null,
    failureMessage: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as CreditPackPurchase;

  const purchases = new Map<string, CreditPackPurchase>([[flittPurchase.id, { ...flittPurchase }]]);
  const ledger: Array<{ idempotencyKey: string }> = [];
  const db = {
    creditPackPurchase: {
      async findUnique(args: { where: { id: string } }) {
        return purchases.get(args.where.id) ?? null;
      },
      async findFirst(args: {
        where: { provider?: string; providerPaymentId?: string };
      }) {
        for (const row of purchases.values()) {
          if (args.where.provider && row.provider !== args.where.provider) continue;
          if (
            args.where.providerPaymentId &&
            row.providerPaymentId !== args.where.providerPaymentId
          ) {
            continue;
          }
          return row;
        }
        return null;
      },
      async update(args: { where: { id: string }; data: Partial<CreditPackPurchase> }) {
        const current = purchases.get(args.where.id)!;
        const next = { ...current, ...args.data };
        purchases.set(args.where.id, next);
        return next;
      },
    },
    $executeRaw: async () => 1,
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };

  const callback = await handleTbcCallback("shared-pay-id", {
    prismaClient: db as never,
    log: () => undefined,
    createClient: () => {
      throw new Error("TBC GET must not run for a Flitt purchase");
    },
  });
  assert.equal(callback.ignored, true);
  assert.equal(callback.reason, "unknown_payment_id");
  assert.equal(purchases.get(flittPurchase.id)?.status, "provider_created");
  assert.equal(ledger.length, 0);

  const applied = await applyFetchedTbcPayment(
    flittPurchase,
    {
      payId: "shared-pay-id",
      status: "Succeeded",
      currency: "USD",
      amount: 29,
      links: [],
    },
    {
      db: db as never,
      log: () => undefined,
    },
  );
  assert.equal(applied.ignored, true);
  assert.equal(applied.reason, "provider_mismatch");
  assert.equal(applied.credited, false);
  assert.equal(purchases.get(flittPurchase.id)?.status, "provider_created");
}

console.log("payment-provider-selection.contract.test.ts: ok");

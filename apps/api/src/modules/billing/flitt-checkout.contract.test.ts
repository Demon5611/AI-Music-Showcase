/**
 * Flitt hosted checkout contracts: CTA readiness, signature, verification, routes.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/billing/flitt-checkout.contract.test.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, type CreditPackPurchase } from "@ai-music/db";
import {
  FLITT_PAYMENT_PROVIDER,
  FLITT_PRODUCTION_CALLBACK_URL,
  FLITT_PRODUCTION_PRICING_APPROVED,
  FLITT_PRODUCTION_RETURN_URL,
  buildFlittCreditGrantIdempotencyKey,
  createCreditPackCheckoutSchema,
  createTestUsdGelQuote,
  getCreditPackagePriceUsd,
  NbgUsdGelFxProvider,
} from "@ai-music/shared";
import { createCreditPackCheckout, getCreditPackCheckoutStatus } from "./credit-pack-checkout.service.js";
import { applyFetchedFlittPayment } from "./flitt-payment-fulfillment.service.js";
import {
  FlittCheckoutError,
  generateFlittSignature,
  isFlittCheckoutReady,
  isTrustedFlittCheckoutUrl,
  resolveFlittCheckoutConfig,
  toFlittMinorUnits,
  verifyFlittSignature,
} from "./providers/flitt.js";
import { loadApiEnv } from "../../config/env.js";

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

assert.deepEqual(getCreditPackCheckoutStatus({ FLITT_ENABLED: false }), {
  checkoutEnabled: false,
});
assert.deepEqual(getCreditPackCheckoutStatus({ FLITT_ENABLED: true }), {
  checkoutEnabled: false,
});
assert.equal(isFlittCheckoutReady(FLITT_READY), true);
assert.deepEqual(getCreditPackCheckoutStatus(FLITT_READY), { checkoutEnabled: true });
assert.deepEqual(
  getCreditPackCheckoutStatus({ ...FLITT_READY, PAYMENT_PROVIDER: undefined }),
  { checkoutEnabled: true },
);
assert.equal(isFlittCheckoutReady({ ...FLITT_READY, APP_ENV: "production" }), false);
assert.equal(FLITT_PRODUCTION_PRICING_APPROVED, true);
assert.deepEqual(
  getCreditPackCheckoutStatus({ APP_ENV: "production", FLITT_ENABLED: false }),
  { checkoutEnabled: false },
);
assert.deepEqual(
  getCreditPackCheckoutStatus({
    APP_ENV: "production",
    FLITT_ENABLED: true,
    FLITT_API_BASE_URL: "https://pay.flitt.com",
    FLITT_MERCHANT_ID: "999000001",
    FLITT_PAYMENT_KEY: "live-payment-key-not-a-secret",
    FLITT_CURRENCY: "GEL",
    FLITT_CALLBACK_URL: FLITT_PRODUCTION_CALLBACK_URL,
    FLITT_RETURN_URL: FLITT_PRODUCTION_RETURN_URL,
  }),
  { checkoutEnabled: true },
  "approved USD→GEL pricing allows production checkout when Flitt config is complete",
);

assert.equal(createCreditPackCheckoutSchema.safeParse({ packageId: "free" }).success, false);
assert.equal(
  createCreditPackCheckoutSchema.safeParse({
    packageId: "creator",
    amount: 1,
    currency: "GEL",
  }).success,
  false,
);
assert.equal(getCreditPackagePriceUsd("creator"), 29);
assert.equal(toFlittMinorUnits(29), 2900);

assert.equal(
  isTrustedFlittCheckoutUrl(
    "https://pay.flitt.com/merchants/abc/default/index.html?token=1",
  ),
  true,
);
assert.equal(isTrustedFlittCheckoutUrl("https://evil.example/merchants/abc"), false);

const official = {
  amount: 1000,
  currency: "GEL",
  merchant_id: 1549901,
  order_desc: "Test payment",
  order_id: "TestOrder2",
  server_callback_url: "http://myshop/callback/",
};
const officialSig = generateFlittSignature("test", official);
assert.equal(
  officialSig,
  createHash("sha1")
    .update("test|1000|GEL|1549901|Test payment|TestOrder2|http://myshop/callback/", "utf8")
    .digest("hex"),
);
assert.equal(verifyFlittSignature("test", { ...official, signature: officialSig }), true);
assert.equal(
  verifyFlittSignature("test", { ...official, amount: 9, signature: officialSig }),
  false,
);

assert.equal(
  buildFlittCreditGrantIdempotencyKey("805230052"),
  "flitt_payment:805230052:credit_grant",
);

{
  const routes = readFileSync(join(here, "routes.ts"), "utf8");
  assert.match(routes, /\/api\/billing\/flitt\/callback/);
  assert.match(routes, /handleFlittCallback/);
  assert.match(routes, /\/api\/billing\/purchases\/:purchaseId/);
  assert.match(routes, /getCreditPackPurchaseStatusOnly/);
  assert.match(routes, /preHandler:\s*requireAuth/);
  assert.equal(routes.includes("NEXT_PUBLIC_FLITT"), false);
  assert.equal(routes.includes("FLITT_PAYMENT_KEY"), false);
  const purchaseGet = routes.slice(
    routes.indexOf("/api/billing/purchases/:purchaseId"),
    routes.indexOf("/api/billing/tbc/callback"),
  );
  assert.doesNotMatch(purchaseGet, /handleFlittCallback|grantCredits|spendCredits/);
}

{
  const checkout = readFileSync(join(here, "credit-pack-checkout.service.ts"), "utf8");
  assert.match(checkout, /appendPurchaseIdToReturnUrl/);
  assert.match(checkout, /getCreditPackPurchaseStatusOnly/);
  assert.doesNotMatch(
    checkout.slice(
      checkout.indexOf("export async function getCreditPackPurchaseStatusOnly"),
      checkout.indexOf("export {"),
    ),
    /handleFlittCallback|grantCredits/,
  );
}

{
  const fulfillment = readFileSync(join(here, "flitt-payment-fulfillment.service.ts"), "utf8");
  assert.match(fulfillment, /verifyFlittSignature/);
  assert.match(fulfillment, /getOrderStatus/);
  assert.match(fulfillment, /already_credited/);
  assert.equal(fulfillment.includes("FLITT_PAYMENT_KEY"), false);
  assert.doesNotMatch(fulfillment, /masked_card/);
  assert.doesNotMatch(fulfillment, /getUsdGelQuote|FxRateProvider|convertUsdMajorToGel/);
}

type LedgerRow = { idempotencyKey: string; amountUnits: number; userId: string };

function createMemoryDb(seed: CreditPackPurchase) {
  const purchases = new Map<string, CreditPackPurchase>([[seed.id, { ...seed }]]);
  const ledger: LedgerRow[] = [];

  const db: {
    creditPackPurchase: {
      findUnique: (args: { where: { id: string } }) => Promise<CreditPackPurchase | null>;
      findUniqueOrThrow: (args: { where: { id: string } }) => Promise<CreditPackPurchase>;
      update: (args: {
        where: { id: string };
        data: Partial<CreditPackPurchase>;
      }) => Promise<CreditPackPurchase>;
    };
    $executeRaw: () => Promise<number>;
    $transaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
    ledger: LedgerRow[];
  } = {
    creditPackPurchase: {
      findUnique: async ({ where }) => purchases.get(where.id) ?? null,
      findUniqueOrThrow: async ({ where }) => {
        const row = purchases.get(where.id);
        if (!row) throw new Error("missing");
        return row;
      },
      update: async ({ where, data }) => {
        const current = purchases.get(where.id)!;
        const next = { ...current, ...data };
        purchases.set(where.id, next);
        return next;
      },
    },
    $executeRaw: async () => 1,
    $transaction: async (fn) => fn(db),
    ledger,
  };

  return db;
}

const purchase = {
  id: "p-flitt-1",
  userId: "user-1",
  provider: FLITT_PAYMENT_PROVIDER,
  packageId: "creator",
  priceAmount: new Prisma.Decimal(29),
  currency: "GEL",
  creditsAmount: 2000,
  merchantPaymentId: "p-flitt-1",
  providerPaymentId: "805230052",
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

{
  const db = createMemoryDb(purchase);
  const result = await applyFetchedFlittPayment(
    purchase,
    {
      paymentId: "805230052",
      orderId: "p-flitt-1",
      merchantId: "1549901",
      amountMinor: 2900,
      actualAmountMinor: 2900,
      currency: "GEL",
      orderStatus: "declined",
    },
    { merchantId: 1549901 },
    { db: db as never, log: () => undefined },
  );
  assert.equal(result.credited, false);
  assert.equal(result.reason, "provider_declined");
}

{
  const db = createMemoryDb(purchase);
  const result = await applyFetchedFlittPayment(
    purchase,
    {
      paymentId: "805230052",
      orderId: "p-flitt-1",
      merchantId: "1549901",
      amountMinor: 900,
      actualAmountMinor: 900,
      currency: "GEL",
      orderStatus: "approved",
    },
    { merchantId: 1549901 },
    { db: db as never, log: () => undefined },
  );
  assert.equal(result.credited, false);
  assert.equal(result.status, "verification_failed");
}

{
  const snap = new Map<string, string | undefined>();
  for (const key of [
    "APP_ENV",
    "DATABASE_URL",
    "REDIS_URL",
    "AUTH_DEV_MODE",
    "PAYMENT_PROVIDER",
    "FLITT_ENABLED",
    "FLITT_API_BASE_URL",
    "FLITT_MERCHANT_ID",
    "FLITT_PAYMENT_KEY",
    "FLITT_CURRENCY",
    "FLITT_CALLBACK_URL",
    "FLITT_RETURN_URL",
    "TBC_CHECKOUT_ENABLED",
  ]) {
    snap.set(key, process.env[key]);
  }
  try {
    process.env.APP_ENV = "development";
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/ai_music_test";
    process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
    delete process.env.AUTH_DEV_MODE;
    process.env.FLITT_ENABLED = "false";
    delete process.env.PAYMENT_PROVIDER;
    delete process.env.FLITT_PAYMENT_KEY;
    process.env.TBC_CHECKOUT_ENABLED = "false";
    const env = loadApiEnv();
    assert.equal(env.FLITT_ENABLED, false);
    assert.equal(resolveFlittCheckoutConfig(env), null);
  } finally {
    for (const [key, value] of snap) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

{
  assert.throws(() =>
    resolveFlittCheckoutConfig({
      ...FLITT_READY,
      APP_ENV: "production",
    }),
  );
}

{
  const purchases = new Map();
  let providerCalled = false;
  await assert.rejects(
    () =>
      createCreditPackCheckout(
        "user-1",
        { packageId: "creator" },
        {
          env: { APP_ENV: "production", FLITT_ENABLED: false },
          prismaClient: {
            creditPackPurchase: {
              findUnique: async () => null,
              create: async () => {
                throw new Error("must not persist purchase when checkout disabled");
              },
            },
          } as never,
          createFlittProvider: () => {
            providerCalled = true;
            throw new Error("must not call Flitt");
          },
          createIdFn: () => "purchase-prod-disabled",
        },
      ),
  );
  assert.equal(providerCalled, false);
  assert.equal(purchases.size, 0);
}

{
  const snap = new Map<string, string | undefined>();
  const keys = [
    "APP_ENV",
    "DATABASE_URL",
    "REDIS_URL",
    "AUTH_DEV_MODE",
    "PAYMENT_PROVIDER",
    "FLITT_ENABLED",
    "FLITT_API_BASE_URL",
    "FLITT_MERCHANT_ID",
    "FLITT_PAYMENT_KEY",
    "FLITT_CURRENCY",
    "FLITT_CALLBACK_URL",
    "FLITT_RETURN_URL",
    "TBC_CHECKOUT_ENABLED",
    "STORAGE_DRIVER",
    "CLERK_SECRET_KEY",
    "CLERK_WEBHOOK_SECRET",
    "API_PROVIDER_REFERENCE_SECRET",
    "OPS_ADMIN_TOKEN",
    "SUNO_API_KEY",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "RESEND_API_KEY",
    "RESEND_INBOUND_WEBHOOK_SECRET",
    "RESEND_INBOUND_ADDRESS",
    "RESEND_INBOUND_FORWARD_TO",
    "RESEND_INBOUND_FROM",
  ];
  for (const key of keys) {
    snap.set(key, process.env[key]);
  }
  try {
    process.env.APP_ENV = "production";
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/ai_music_test";
    process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
    process.env.AUTH_DEV_MODE = "false";
    process.env.STORAGE_DRIVER = "r2";
    process.env.CLERK_SECRET_KEY = "sk_test_placeholder";
    process.env.CLERK_WEBHOOK_SECRET = "whsec_placeholder";
    process.env.API_PROVIDER_REFERENCE_SECRET = "ref-secret-placeholder";
    process.env.OPS_ADMIN_TOKEN = "ops-placeholder";
    process.env.SUNO_API_KEY = "suno-placeholder";
    process.env.R2_ACCOUNT_ID = "r2-account";
    process.env.R2_ACCESS_KEY_ID = "r2-key";
    process.env.R2_SECRET_ACCESS_KEY = "r2-secret";
    process.env.R2_BUCKET_NAME = "r2-bucket";
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_INBOUND_WEBHOOK_SECRET;
    delete process.env.RESEND_INBOUND_ADDRESS;
    delete process.env.RESEND_INBOUND_FORWARD_TO;
    delete process.env.RESEND_INBOUND_FROM;
    process.env.FLITT_ENABLED = "false";
    delete process.env.PAYMENT_PROVIDER;
    delete process.env.FLITT_PAYMENT_KEY;
    process.env.TBC_CHECKOUT_ENABLED = "false";
    const env = loadApiEnv();
    assert.equal(env.FLITT_ENABLED, false);
    assert.equal(resolveFlittCheckoutConfig(env), null);
    assert.deepEqual(getCreditPackCheckoutStatus(env), { checkoutEnabled: false });
  } finally {
    for (const [key, value] of snap) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

{
  const snap = new Map<string, string | undefined>();
  const keys = [
    "APP_ENV",
    "DATABASE_URL",
    "REDIS_URL",
    "AUTH_DEV_MODE",
    "FLITT_ENABLED",
    "FLITT_MERCHANT_ID",
    "FLITT_PAYMENT_KEY",
    "FLITT_CALLBACK_URL",
    "FLITT_RETURN_URL",
    "STORAGE_DRIVER",
    "CLERK_SECRET_KEY",
    "CLERK_WEBHOOK_SECRET",
    "API_PROVIDER_REFERENCE_SECRET",
    "OPS_ADMIN_TOKEN",
    "SUNO_API_KEY",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "RESEND_API_KEY",
    "RESEND_INBOUND_WEBHOOK_SECRET",
    "RESEND_INBOUND_ADDRESS",
    "RESEND_INBOUND_FORWARD_TO",
    "RESEND_INBOUND_FROM",
  ];
  for (const key of keys) {
    snap.set(key, process.env[key]);
  }
  try {
    process.env.APP_ENV = "production";
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/ai_music_test";
    process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
    process.env.AUTH_DEV_MODE = "false";
    process.env.STORAGE_DRIVER = "r2";
    process.env.CLERK_SECRET_KEY = "sk_test_placeholder";
    process.env.CLERK_WEBHOOK_SECRET = "whsec_placeholder";
    process.env.API_PROVIDER_REFERENCE_SECRET = "ref-secret-placeholder";
    process.env.OPS_ADMIN_TOKEN = "ops-placeholder";
    process.env.SUNO_API_KEY = "suno-placeholder";
    process.env.R2_ACCOUNT_ID = "r2-account";
    process.env.R2_ACCESS_KEY_ID = "r2-key";
    process.env.R2_SECRET_ACCESS_KEY = "r2-secret";
    process.env.R2_BUCKET_NAME = "r2-bucket";
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_INBOUND_WEBHOOK_SECRET;
    delete process.env.RESEND_INBOUND_ADDRESS;
    delete process.env.RESEND_INBOUND_FORWARD_TO;
    delete process.env.RESEND_INBOUND_FROM;
    process.env.FLITT_ENABLED = "true";
    delete process.env.FLITT_MERCHANT_ID;
    delete process.env.FLITT_PAYMENT_KEY;
    delete process.env.FLITT_CALLBACK_URL;
    delete process.env.FLITT_RETURN_URL;
    assert.throws(() => loadApiEnv(), /missing: FLITT_MERCHANT_ID, FLITT_PAYMENT_KEY/);
  } finally {
    for (const [key, value] of snap) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

{
  const snap = new Map<string, string | undefined>();
  const keys = [
    "APP_ENV",
    "DATABASE_URL",
    "REDIS_URL",
    "AUTH_DEV_MODE",
    "FLITT_ENABLED",
    "FLITT_MERCHANT_ID",
    "FLITT_PAYMENT_KEY",
    "FLITT_CALLBACK_URL",
    "FLITT_RETURN_URL",
    "FLITT_API_BASE_URL",
    "FLITT_CURRENCY",
    "STORAGE_DRIVER",
    "CLERK_SECRET_KEY",
    "CLERK_WEBHOOK_SECRET",
    "API_PROVIDER_REFERENCE_SECRET",
    "OPS_ADMIN_TOKEN",
    "SUNO_API_KEY",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "RESEND_API_KEY",
    "RESEND_INBOUND_WEBHOOK_SECRET",
    "RESEND_INBOUND_ADDRESS",
    "RESEND_INBOUND_FORWARD_TO",
    "RESEND_INBOUND_FROM",
  ];
  for (const key of keys) {
    snap.set(key, process.env[key]);
  }
  try {
    process.env.APP_ENV = "production";
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/ai_music_test";
    process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
    process.env.AUTH_DEV_MODE = "false";
    process.env.STORAGE_DRIVER = "r2";
    process.env.CLERK_SECRET_KEY = "sk_test_placeholder";
    process.env.CLERK_WEBHOOK_SECRET = "whsec_placeholder";
    process.env.API_PROVIDER_REFERENCE_SECRET = "ref-secret-placeholder";
    process.env.OPS_ADMIN_TOKEN = "ops-placeholder";
    process.env.SUNO_API_KEY = "suno-placeholder";
    process.env.R2_ACCOUNT_ID = "r2-account";
    process.env.R2_ACCESS_KEY_ID = "r2-key";
    process.env.R2_SECRET_ACCESS_KEY = "r2-secret";
    process.env.R2_BUCKET_NAME = "r2-bucket";
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_INBOUND_WEBHOOK_SECRET;
    delete process.env.RESEND_INBOUND_ADDRESS;
    delete process.env.RESEND_INBOUND_FORWARD_TO;
    delete process.env.RESEND_INBOUND_FROM;
    process.env.FLITT_ENABLED = "true";
    process.env.FLITT_MERCHANT_ID = "999000001";
    process.env.FLITT_PAYMENT_KEY = "live-payment-key-not-a-secret";
    process.env.FLITT_API_BASE_URL = "https://pay.flitt.com";
    process.env.FLITT_CURRENCY = "GEL";
    process.env.FLITT_CALLBACK_URL = FLITT_PRODUCTION_CALLBACK_URL;
    process.env.FLITT_RETURN_URL = FLITT_PRODUCTION_RETURN_URL;
    assert.doesNotThrow(() => loadApiEnv());
  } finally {
    for (const [key, value] of snap) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

{
  const checkout = readFileSync(join(here, "credit-pack-checkout.service.ts"), "utf8");
  const reuseCall = checkout.indexOf("const reused = await reuseExistingCheckout(existing, options, config)");
  const fxCall = checkout.indexOf("await resolveUsdGelQuote(options)");
  const persistCall = checkout.indexOf("creditPackPurchase.create");
  assert.ok(reuseCall > 0 && fxCall > reuseCall, "FX quote must run after idempotency reuse");
  assert.ok(persistCall > fxCall, "Purchase persist must run after FX quote");
}

{
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
          const clientRequestId = args.data.clientRequestId;
          if (typeof clientRequestId === "string" && clientRequestId.length > 0) {
            for (const existing of purchases.values()) {
              if (
                existing.userId === args.data.userId &&
                existing.clientRequestId === clientRequestId
              ) {
                const error = new Error("Unique constraint failed") as Error & { code: string };
                error.code = "P2002";
                throw error;
              }
            }
          }
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

  const flittConfig = {
    enabled: true,
    apiBaseUrl: "https://pay.flitt.com",
    merchantId: 1_549_901,
    paymentKey: "staging-test-key",
    currency: "GEL" as const,
    callbackUrl: FLITT_READY.FLITT_CALLBACK_URL,
    returnUrl: FLITT_READY.FLITT_RETURN_URL,
  };

  {
    const db = createCheckoutDb();
    let capturedAmountMinor: number | undefined;
    let capturedCurrency: string | undefined;
    const result = await createCreditPackCheckout(
      "user-1",
      { packageId: "creator" },
      {
        env: FLITT_READY,
        prismaClient: db as never,
        resolveFlittConfig: () => flittConfig,
        getUsdGelQuote: async () => createTestUsdGelQuote("2.72"),
        createFlittProvider: () =>
          ({
            createCheckout: async (input: { amountMinor: number; currency: string }) => {
              capturedAmountMinor = input.amountMinor;
              capturedCurrency = input.currency;
              return {
                provider: FLITT_PAYMENT_PROVIDER,
                providerPaymentId: "805230052",
                approvalUrl: "https://pay.flitt.com/merchants/x/default/index.html?token=1",
                providerStatus: "created",
              };
            },
          }) as never,
        createIdFn: () => "purchase-fx-creator",
      },
    );
    assert.equal(result.currency, "GEL");
    assert.equal(result.priceAmount, 78.88);
    assert.equal(capturedAmountMinor, 7888);
    assert.equal(capturedCurrency, "GEL");
    const stored = db.purchases.get("purchase-fx-creator");
    assert.equal(stored?.currency, "GEL");
    assert.equal(Number(stored?.priceAmount), 78.88);
    assert.equal(Number(stored?.basePriceAmount), 29);
    assert.equal(stored?.baseCurrency, "USD");
    assert.equal(String(stored?.fxRate), "2.72");
    assert.equal(stored?.fxSource, "test-static");
  }

  {
    const db = createCheckoutDb();
    const result = await createCreditPackCheckout(
      "user-1",
      { packageId: "creator" },
      {
        env: FLITT_READY,
        prismaClient: db as never,
        resolveFlittConfig: () => flittConfig,
        fxRateProvider: new NbgUsdGelFxProvider({
          now: () => new Date("2026-08-20T10:00:00.000Z"),
          fetchImpl: async () =>
            new Response(
              JSON.stringify([
                {
                  date: "2026-08-20T00:00:00.000Z",
                  currencies: [
                    {
                      code: "USD",
                      quantity: 1,
                      rateFormated: "2.6300",
                      validFromDate: "2026-08-20T00:00:00.000Z",
                    },
                  ],
                },
              ]),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
        }),
        createFlittProvider: () =>
          ({
            createCheckout: async (input: { amountMinor: number }) => {
              assert.equal(input.amountMinor, 7627);
              return {
                provider: FLITT_PAYMENT_PROVIDER,
                providerPaymentId: "805230104",
                approvalUrl: "https://pay.flitt.com/merchants/x/default/index.html?token=nbg",
                providerStatus: "created",
              };
            },
          }) as never,
        createIdFn: () => "purchase-nbg-fx",
      },
    );
    assert.equal(result.priceAmount, 76.27);
    assert.equal(db.purchases.get("purchase-nbg-fx")?.fxSource, "nbg");
    assert.equal(Number(db.purchases.get("purchase-nbg-fx")?.fxRate), 2.63);
  }

  {
    const db = createCheckoutDb();
    let fxCalls = 0;
    let flittCreates = 0;
    const options = {
      env: FLITT_READY,
      prismaClient: db as never,
      resolveFlittConfig: () => flittConfig,
      getUsdGelQuote: async () => {
        fxCalls += 1;
        return createTestUsdGelQuote(fxCalls === 1 ? "2.72" : "9.99");
      },
      createFlittProvider: () =>
        ({
          createCheckout: async () => {
            flittCreates += 1;
            return {
              provider: FLITT_PAYMENT_PROVIDER,
              providerPaymentId: "805230099",
              approvalUrl: "https://pay.flitt.com/merchants/x/default/index.html?token=9",
              providerStatus: "created",
            };
          },
        }) as never,
      createIdFn: () => "purchase-fx-idempotent",
    };
    const first = await createCreditPackCheckout(
      "user-1",
      { packageId: "creator", clientRequestId: "same-checkout-key-01" },
      options,
    );
    const second = await createCreditPackCheckout(
      "user-1",
      { packageId: "creator", clientRequestId: "same-checkout-key-01" },
      options,
    );
    assert.equal(fxCalls, 1, "idempotent retry must not fetch a new FX quote");
    assert.equal(flittCreates, 1);
    assert.equal(first.purchaseId, second.purchaseId);
    assert.equal(first.priceAmount, 78.88);
    assert.equal(second.priceAmount, 78.88);
    assert.equal(db.purchases.size, 1);
  }

  {
    const db = createCheckoutDb();
    let fxCalls = 0;
    let flittCreates = 0;
    const capturedOrderIds: string[] = [];
    const options = {
      env: FLITT_READY,
      prismaClient: db as never,
      resolveFlittConfig: () => flittConfig,
      getUsdGelQuote: async () => {
        fxCalls += 1;
        return createTestUsdGelQuote(fxCalls === 1 ? "2.72" : "9.99");
      },
      createFlittProvider: () =>
        ({
          createCheckout: async (input: { orderId: string; amountMinor: number }) => {
            flittCreates += 1;
            capturedOrderIds.push(input.orderId);
            if (flittCreates === 1) {
              throw new FlittCheckoutError("Flitt network error", "network", {
                code: "FLITT_NETWORK",
              });
            }
            assert.equal(input.amountMinor, 7888);
            return {
              provider: FLITT_PAYMENT_PROVIDER,
              providerPaymentId: "805230100",
              approvalUrl: "https://pay.flitt.com/merchants/x/default/index.html?token=timeout-retry",
              providerStatus: "created",
            };
          },
        }) as never,
      createIdFn: () => "purchase-fx-timeout",
    };

    await assert.rejects(
      () =>
        createCreditPackCheckout(
          "user-1",
          { packageId: "creator", clientRequestId: "timeout-key-01" },
          options,
        ),
      (error: unknown) =>
        error instanceof Error && (error as { code?: string }).code === "FLITT_NETWORK",
    );

    const afterTimeout = [...db.purchases.values()][0];
    assert.equal(db.purchases.size, 1);
    assert.equal(afterTimeout?.status, "created");
    assert.equal(Number(afterTimeout?.priceAmount), 78.88);
    assert.equal(String(afterTimeout?.fxRate), "2.72");
    assert.equal(afterTimeout?.approvalUrl, null);
    assert.equal(fxCalls, 1);
    assert.equal(flittCreates, 1);

    const retried = await createCreditPackCheckout(
      "user-1",
      { packageId: "creator", clientRequestId: "timeout-key-01" },
      options,
    );
    assert.equal(fxCalls, 1, "timeout retry must not fetch a new FX quote");
    assert.equal(flittCreates, 2);
    assert.equal(db.purchases.size, 1);
    assert.equal(retried.purchaseId, "purchase-fx-timeout");
    assert.equal(retried.priceAmount, 78.88);
    assert.equal(retried.approvalUrl.endsWith("token=timeout-retry"), true);
    assert.deepEqual(capturedOrderIds, ["purchase-fx-timeout", "purchase-fx-timeout"]);
    assert.equal(db.purchases.get("purchase-fx-timeout")?.status, "provider_created");
  }

  {
    const db = createCheckoutDb();
    let fxCalls = 0;
    let flittCreates = 0;
    const options = {
      env: FLITT_READY,
      prismaClient: db as never,
      resolveFlittConfig: () => flittConfig,
      getUsdGelQuote: async () => {
        fxCalls += 1;
        return createTestUsdGelQuote("2.72");
      },
      createFlittProvider: () =>
        ({
          createCheckout: async () => {
            flittCreates += 1;
            return {
              provider: FLITT_PAYMENT_PROVIDER,
              providerPaymentId: "805230101",
              approvalUrl: "https://pay.flitt.com/merchants/x/default/index.html?token=existing",
              providerStatus: "created",
            };
          },
        }) as never,
      createIdFn: () => "purchase-existing-url",
    };
    const first = await createCreditPackCheckout(
      "user-1",
      { packageId: "creator", clientRequestId: "existing-url-key" },
      options,
    );
    const second = await createCreditPackCheckout(
      "user-1",
      { packageId: "creator", clientRequestId: "existing-url-key" },
      options,
    );
    assert.equal(fxCalls, 1);
    assert.equal(flittCreates, 1, "existing checkout URL must not call Flitt create");
    assert.equal(first.approvalUrl, second.approvalUrl);
    assert.equal(db.purchases.size, 1);
  }

  {
    const db = createCheckoutDb();
    db.purchases.set("purchase-concurrent-retry", {
      id: "purchase-concurrent-retry",
      userId: "user-1",
      provider: FLITT_PAYMENT_PROVIDER,
      packageId: "creator",
      priceAmount: new Prisma.Decimal("78.88"),
      currency: "GEL",
      basePriceAmount: new Prisma.Decimal("29"),
      baseCurrency: "USD",
      fxRate: new Prisma.Decimal("2.72"),
      fxQuotedAt: new Date("2026-08-19T12:00:00.000Z"),
      fxSource: "test-static",
      creditsAmount: 2000,
      merchantPaymentId: "purchase-concurrent-retry",
      status: "created",
      clientRequestId: "concurrent-retry-key",
      providerPaymentId: null,
      providerStatus: null,
      approvalUrl: null,
      paidAt: null,
      creditedAt: null,
      failureCode: "FLITT_NETWORK",
      failureMessage: "Payment provider error. Please try again later",
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as CreditPackPurchase);

    let fxCalls = 0;
    let flittCreates = 0;
    const capturedOrderIds: string[] = [];
    const options = {
      env: FLITT_READY,
      prismaClient: db as never,
      resolveFlittConfig: () => flittConfig,
      getUsdGelQuote: async () => {
        fxCalls += 1;
        return createTestUsdGelQuote("9.99");
      },
      createFlittProvider: () =>
        ({
          createCheckout: async (input: { orderId: string; amountMinor: number }) => {
            flittCreates += 1;
            capturedOrderIds.push(input.orderId);
            assert.equal(input.amountMinor, 7888);
            await new Promise((resolve) => setTimeout(resolve, 20));
            return {
              provider: FLITT_PAYMENT_PROVIDER,
              providerPaymentId: "805230102",
              approvalUrl: "https://pay.flitt.com/merchants/x/default/index.html?token=concurrent",
              providerStatus: "created",
            };
          },
        }) as never,
      createIdFn: () => "purchase-must-not-be-created",
    };

    const [first, second] = await Promise.all([
      createCreditPackCheckout(
        "user-1",
        { packageId: "creator", clientRequestId: "concurrent-retry-key" },
        options,
      ),
      createCreditPackCheckout(
        "user-1",
        { packageId: "creator", clientRequestId: "concurrent-retry-key" },
        options,
      ),
    ]);
    assert.equal(fxCalls, 0);
    assert.equal(db.purchases.size, 1);
    assert.equal(flittCreates, 1, "in-process concurrent retries must share one Flitt create");
    assert.equal(first.purchaseId, second.purchaseId);
    assert.equal(first.priceAmount, 78.88);
    assert.equal(second.priceAmount, 78.88);
    assert.deepEqual(capturedOrderIds, ["purchase-concurrent-retry"]);
  }

  {
    const db = createCheckoutDb();
    let fxCalls = 0;
    let flittCreates = 0;
    const options = {
      env: FLITT_READY,
      prismaClient: db as never,
      resolveFlittConfig: () => flittConfig,
      getUsdGelQuote: async () => {
        fxCalls += 1;
        return createTestUsdGelQuote(fxCalls === 1 ? "2.72" : "9.99");
      },
      createFlittProvider: () =>
        ({
          createCheckout: async () => {
            flittCreates += 1;
            throw new FlittCheckoutError("Flitt request failed", "provider_4xx", {
              code: "FLITT_ERROR_1007",
              httpStatus: 400,
            });
          },
        }) as never,
      createIdFn: () => "purchase-fx-rejected",
    };

    await assert.rejects(
      () =>
        createCreditPackCheckout(
          "user-1",
          { packageId: "creator", clientRequestId: "rejected-key-01" },
          options,
        ),
      (error: unknown) =>
        error instanceof Error && (error as { code?: string }).code === "FLITT_ERROR_1007",
    );
    assert.equal(fxCalls, 1);
    assert.equal(flittCreates, 1);
    assert.equal(db.purchases.get("purchase-fx-rejected")?.status, "failed");
    assert.equal(Number(db.purchases.get("purchase-fx-rejected")?.priceAmount), 78.88);

    await assert.rejects(
      () =>
        createCreditPackCheckout(
          "user-1",
          { packageId: "creator", clientRequestId: "rejected-key-01" },
          options,
        ),
      (error: unknown) =>
        error instanceof Error && (error as { code?: string }).code === "CHECKOUT_IN_PROGRESS",
    );
    assert.equal(fxCalls, 1, "definitive Flitt rejection must not fetch a new FX quote");
    assert.equal(flittCreates, 1);
    assert.equal(db.purchases.size, 1);
  }

  {
    const db = createCheckoutDb();
    let statusCalls = 0;
    let flittCreates = 0;
    const options = {
      env: FLITT_READY,
      prismaClient: db as never,
      resolveFlittConfig: () => flittConfig,
      getUsdGelQuote: async () => createTestUsdGelQuote("2.72"),
      createFlittProvider: () =>
        ({
          getPayment: async (orderId: string) => {
            statusCalls += 1;
            assert.equal(orderId, "purchase-fx-timeout");
            throw new FlittCheckoutError("Flitt order status is incomplete", "protocol", {
              code: "FLITT_STATUS_INCOMPLETE",
            });
          },
          createCheckout: async (input: { orderId: string }) => {
            flittCreates += 1;
            if (flittCreates === 1) {
              throw new FlittCheckoutError("Flitt network error", "network", {
                code: "FLITT_NETWORK",
              });
            }
            assert.equal(input.orderId, "purchase-fx-timeout");
            return {
              provider: FLITT_PAYMENT_PROVIDER,
              providerPaymentId: "805230103",
              approvalUrl: "https://pay.flitt.com/merchants/x/default/index.html?token=probed",
              providerStatus: "created",
            };
          },
        }) as never,
      createIdFn: () => "purchase-fx-timeout",
    };

    await assert.rejects(() =>
      createCreditPackCheckout(
        "user-1",
        { packageId: "creator", clientRequestId: "probe-key-01" },
        options,
      ),
    );
    const retried = await createCreditPackCheckout(
      "user-1",
      { packageId: "creator", clientRequestId: "probe-key-01" },
      options,
    );
    assert.equal(statusCalls >= 1, true);
    assert.equal(flittCreates, 2);
    assert.equal(retried.purchaseId, "purchase-fx-timeout");
    assert.equal(db.purchases.size, 1);
  }

  {
    const db = createCheckoutDb();
    let flittCreates = 0;
    await assert.rejects(
      () =>
        createCreditPackCheckout(
          "user-1",
          { packageId: "creator" },
          {
            env: FLITT_READY,
            prismaClient: db as never,
            resolveFlittConfig: () => flittConfig,
            createFlittProvider: () =>
              ({
                createCheckout: async () => {
                  flittCreates += 1;
                  throw new Error("must not call Flitt when FX fails");
                },
              }) as never,
            createIdFn: () => "purchase-fx-fail",
          },
        ),
    );
    assert.equal(flittCreates, 0);
    assert.equal(db.purchases.size, 0);
  }
}

console.log("flitt-checkout.contract.test.ts: ok");

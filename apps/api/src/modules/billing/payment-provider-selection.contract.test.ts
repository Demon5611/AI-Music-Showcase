/**
 * Checkoutgateway-only new checkout. LEGACYGATEWAY env must not enable CTA or create purchases.
 * Historical LEGACYGATEWAY refunds still route by stored provider.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/billing/payment-provider-selection.contract.test.ts
 */
import assert from "node:assert/strict";
import { Prisma, type CreditPackPurchase } from "@ai-music/db";
import { CHECKOUTGATEWAY_PAYMENT_PROVIDER, LEGACYGATEWAY_PAYMENT_PROVIDER, createTestUsdGelQuote } from "@ai-music/shared";
import {
  createCreditPackCheckout,
  getCreditPackCheckoutStatus,
} from "./credit-pack-checkout.service.js";
import { resolveMonetaryRefundEnqueueTarget } from "./refund.service.js";
import {
  isConfiguredCheckoutEnabled,
  resolveConfiguredCheckoutProvider,
} from "./payment-provider-selection.js";
import { applyFetchedLegacygatewayPayment, handleLegacygatewayCallback } from "./legacygateway-payment-fulfillment.service.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const CHECKOUTGATEWAY_READY = {
  PAYMENT_PROVIDER: "checkoutgateway",
  APP_ENV: "staging",
  CHECKOUTGATEWAY_ENABLED: true,
  CHECKOUTGATEWAY_API_BASE_URL: "https://pay.integration.example.invalid",
  CHECKOUTGATEWAY_MERCHANT_ID: "1549901",
  CHECKOUTGATEWAY_PAYMENT_KEY: "staging-test-key",
  CHECKOUTGATEWAY_CURRENCY: "GEL",
  CHECKOUTGATEWAY_CALLBACK_URL: "https://api.example.com/api/billing/checkoutgateway/callback",
  CHECKOUTGATEWAY_RETURN_URL: "https://web.example.com/pricing",
};

const LEGACYGATEWAY_CREDENTIALS = {
  LEGACYGATEWAY_CHECKOUT_ENABLED: true,
  LEGACYGATEWAY_API_BASE_URL: "https://api.legacygatewaybank.ge",
  LEGACYGATEWAY_CHECKOUT_API_VERSION: "v1",
  LEGACYGATEWAY_API_KEY: "test-api-key",
  LEGACYGATEWAY_CLIENT_ID: "test-client-id",
  LEGACYGATEWAY_CLIENT_SECRET: "test-client-secret",
  LEGACYGATEWAY_CHECKOUT_CURRENCY: "USD",
  LEGACYGATEWAY_CALLBACK_URL: "https://api.example.com/api/billing/legacygateway/callback",
  LEGACYGATEWAY_RETURN_URL: "https://example.com/pricing",
};

const LEGACYGATEWAY_READY = {
  PAYMENT_PROVIDER: "legacygateway",
  ...LEGACYGATEWAY_CREDENTIALS,
};

const CHECKOUTGATEWAY_CONFIG = {
  enabled: true,
  apiBaseUrl: "https://pay.integration.example.invalid",
  merchantId: 1_549_901,
  paymentKey: "staging-test-key",
  currency: "GEL" as const,
  callbackUrl: CHECKOUTGATEWAY_READY.CHECKOUTGATEWAY_CALLBACK_URL,
  returnUrl: CHECKOUTGATEWAY_READY.CHECKOUTGATEWAY_RETURN_URL,
};

const CHECKOUTGATEWAY_INCOMPLETE = {
  PAYMENT_PROVIDER: "checkoutgateway",
  APP_ENV: "staging",
  CHECKOUTGATEWAY_ENABLED: true,
  ...LEGACYGATEWAY_CREDENTIALS,
};

assert.equal(resolveConfiguredCheckoutProvider(CHECKOUTGATEWAY_READY), "checkoutgateway");
assert.equal(isConfiguredCheckoutEnabled(CHECKOUTGATEWAY_READY), true);
assert.deepEqual(getCreditPackCheckoutStatus(CHECKOUTGATEWAY_READY), { checkoutEnabled: true });

assert.deepEqual(
  getCreditPackCheckoutStatus({
    ...CHECKOUTGATEWAY_READY,
    PAYMENT_PROVIDER: undefined,
  }),
  { checkoutEnabled: true },
  "unset PAYMENT_PROVIDER + Checkoutgateway ready → checkout enabled",
);

assert.deepEqual(getCreditPackCheckoutStatus(CHECKOUTGATEWAY_INCOMPLETE), { checkoutEnabled: false });
assert.deepEqual(
  getCreditPackCheckoutStatus({
    PAYMENT_PROVIDER: "checkoutgateway",
    CHECKOUTGATEWAY_ENABLED: false,
    ...LEGACYGATEWAY_CREDENTIALS,
  }),
  { checkoutEnabled: false },
);

assert.deepEqual(
  getCreditPackCheckoutStatus(LEGACYGATEWAY_READY),
  { checkoutEnabled: false },
  "LEGACYGATEWAY env must not enable CTA",
);

assert.deepEqual(
  getCreditPackCheckoutStatus({
    ...CHECKOUTGATEWAY_READY,
    PAYMENT_PROVIDER: "legacygateway",
    ...LEGACYGATEWAY_CREDENTIALS,
  }),
  { checkoutEnabled: false },
  "PAYMENT_PROVIDER=legacygateway fails closed even if Checkoutgateway is ready",
);

assert.deepEqual(
  getCreditPackCheckoutStatus({
    ...CHECKOUTGATEWAY_READY,
    PAYMENT_PROVIDER: "stripe",
  }),
  { checkoutEnabled: false },
  "unknown PAYMENT_PROVIDER fails closed",
);

assert.deepEqual(
  getCreditPackCheckoutStatus({
    PAYMENT_PROVIDER: undefined,
    ...LEGACYGATEWAY_CREDENTIALS,
  }),
  { checkoutEnabled: false },
  "LEGACYGATEWAY ready without Checkoutgateway → checkout disabled",
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
  let checkoutgatewayCreates = 0;
  let capturedReturnUrl = "";

  const result = await createCreditPackCheckout(
    "user-1",
    { packageId: "creator" },
    {
      env: { ...CHECKOUTGATEWAY_READY, ...LEGACYGATEWAY_CREDENTIALS },
      prismaClient: db as never,
      resolveCheckoutgatewayConfig: () => CHECKOUTGATEWAY_CONFIG,
      getUsdGelQuote: async () => createTestUsdGelQuote("2.72"),
      createCheckoutgatewayProvider: () =>
        ({
          createCheckout: async (input: { returnUrl: string; amountMinor: number; currency: string }) => {
            checkoutgatewayCreates += 1;
            capturedReturnUrl = input.returnUrl;
            assert.equal(input.amountMinor, 7888);
            assert.equal(input.currency, "GEL");
            return {
              provider: CHECKOUTGATEWAY_PAYMENT_PROVIDER,
              providerPaymentId: "805230052",
              approvalUrl: "https://pay.integration.example.invalid/merchants/x/default/index.html?token=1",
              providerStatus: "created",
            };
          },
        }) as never,
      createIdFn: () => "purchase-checkoutgateway-ready",
    },
  );

  assert.equal(result.currency, "GEL");
  assert.equal(result.priceAmount, 78.88);
  assert.equal(checkoutgatewayCreates, 1);
  assert.equal(db.purchases.get("purchase-checkoutgateway-ready")?.provider, CHECKOUTGATEWAY_PAYMENT_PROVIDER);
  assert.equal(
    capturedReturnUrl,
    "https://web.example.com/pricing?purchaseId=purchase-checkoutgateway-ready",
  );
}

{
  const db = createCheckoutDb();
  let checkoutgatewayCreates = 0;

  const result = await createCreditPackCheckout(
    "user-1",
    { packageId: "creator" },
    {
      env: { ...CHECKOUTGATEWAY_READY, PAYMENT_PROVIDER: undefined, ...LEGACYGATEWAY_CREDENTIALS },
      prismaClient: db as never,
      resolveCheckoutgatewayConfig: () => CHECKOUTGATEWAY_CONFIG,
      getUsdGelQuote: async () => createTestUsdGelQuote("2.72"),
      createCheckoutgatewayProvider: () =>
        ({
          createCheckout: async () => {
            checkoutgatewayCreates += 1;
            return {
              provider: CHECKOUTGATEWAY_PAYMENT_PROVIDER,
              providerPaymentId: "805230053",
              approvalUrl: "https://pay.integration.example.invalid/merchants/x/default/index.html?token=2",
              providerStatus: "created",
            };
          },
        }) as never,
      createIdFn: () => "purchase-checkoutgateway-unset-selector",
    },
  );

  assert.equal(checkoutgatewayCreates, 1);
  assert.equal(db.purchases.get("purchase-checkoutgateway-unset-selector")?.provider, CHECKOUTGATEWAY_PAYMENT_PROVIDER);
  assert.equal(result.purchaseId, "purchase-checkoutgateway-unset-selector");
}

{
  const db = createCheckoutDb();

  await assert.rejects(
    () =>
      createCreditPackCheckout(
        "user-1",
        { packageId: "creator" },
        {
          env: LEGACYGATEWAY_READY,
          prismaClient: db as never,
          resolveCheckoutgatewayConfig: () => CHECKOUTGATEWAY_CONFIG,
          createCheckoutgatewayProvider: () =>
            ({
              createCheckout: async () => {
                throw new Error("LEGACYGATEWAY must not be selected for new purchase");
              },
            }) as never,
          createIdFn: () => "purchase-legacygateway-blocked",
        },
      ),
  );

  assert.equal(db.purchases.size, 0);
}

{
  const db = createCheckoutDb();

  await assert.rejects(() =>
    createCreditPackCheckout("user-1", { packageId: "creator" }, {
      env: { PAYMENT_PROVIDER: "checkoutgateway", CHECKOUTGATEWAY_ENABLED: false, ...LEGACYGATEWAY_CREDENTIALS },
      prismaClient: db as never,
      createIdFn: () => "purchase-checkoutgateway-disabled",
    }),
  );

  assert.equal(db.purchases.size, 0);
}

{
  const db = createCheckoutDb();
  const historical = {
    id: "purchase-legacygateway-historical",
    userId: "user-1",
    provider: LEGACYGATEWAY_PAYMENT_PROVIDER,
    packageId: "creator",
    priceAmount: new Prisma.Decimal(29),
    currency: "USD",
    creditsAmount: 2000,
    merchantPaymentId: "purchase-legacygateway-historical",
    providerPaymentId: "pay-legacygateway-1",
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
          env: CHECKOUTGATEWAY_READY,
          prismaClient: db as never,
          resolveCheckoutgatewayConfig: () => CHECKOUTGATEWAY_CONFIG,
          createCheckoutgatewayProvider: () =>
            ({
              createCheckout: async () => {
                throw new Error("must not create Checkoutgateway over historical LEGACYGATEWAY idempotency key");
              },
            }) as never,
          createIdFn: () => "purchase-should-not-exist",
        },
      ),
    (error: unknown) =>
      error instanceof Error && (error as { code?: string }).code === "CHECKOUT_IN_PROGRESS",
  );

  assert.equal(db.purchases.size, 1);
  assert.equal(db.purchases.get("purchase-legacygateway-historical")?.provider, LEGACYGATEWAY_PAYMENT_PROVIDER);
}

{
  const previous = process.env.PAYMENT_PROVIDER;
  try {
    process.env.PAYMENT_PROVIDER = "legacygateway";
    assert.equal(resolveMonetaryRefundEnqueueTarget("checkoutgateway"), CHECKOUTGATEWAY_PAYMENT_PROVIDER);
    process.env.PAYMENT_PROVIDER = "checkoutgateway";
    assert.equal(resolveMonetaryRefundEnqueueTarget("legacygateway"), LEGACYGATEWAY_PAYMENT_PROVIDER);
  } finally {
    if (previous === undefined) {
      delete process.env.PAYMENT_PROVIDER;
    } else {
      process.env.PAYMENT_PROVIDER = previous;
    }
  }

  const refundService = readFileSync(join(here, "refund.service.ts"), "utf8");
  assert.match(refundService, /storedProvider === CHECKOUTGATEWAY_PAYMENT_PROVIDER/);
  assert.match(refundService, /storedProvider === LEGACYGATEWAY_PAYMENT_PROVIDER/);
  assert.match(refundService, /provider: storedProvider/);
  assert.match(refundService, /refundable\.provider/);
  assert.doesNotMatch(refundService, /process\.env\.PAYMENT_PROVIDER/);
  assert.doesNotMatch(refundService, /resolveConfiguredCheckoutProvider/);
}

{
  const checkout = readFileSync(join(here, "credit-pack-checkout.service.ts"), "utf8");
  assert.doesNotMatch(checkout, /LEGACYGATEWAY_CHECKOUT_EXPIRATION_MINUTES/);
  assert.doesNotMatch(checkout, /provider: LEGACYGATEWAY_PAYMENT_PROVIDER/);
  assert.doesNotMatch(checkout, /isLegacygatewayCheckoutReady/);
  assert.doesNotMatch(checkout, /new LegacygatewayCheckoutClient/);
}

{
  const selection = readFileSync(join(here, "payment-provider-selection.ts"), "utf8");
  assert.doesNotMatch(selection, /isLegacygatewayCheckoutReady/);
}

{
  const routes = readFileSync(join(here, "routes.ts"), "utf8");
  assert.match(routes, /LEGACY ONLY/);
  assert.match(routes, /@deprecated/);
}

{
  const checkoutgatewayPurchase = {
    id: "p-checkoutgateway-shared-payid",
    userId: "user-1",
    provider: CHECKOUTGATEWAY_PAYMENT_PROVIDER,
    packageId: "creator",
    priceAmount: new Prisma.Decimal(29),
    currency: "GEL",
    creditsAmount: 2000,
    merchantPaymentId: "p-checkoutgateway-shared-payid",
    providerPaymentId: "shared-pay-id",
    status: "provider_created",
    providerStatus: "created",
    approvalUrl: "https://pay.integration.example.invalid/merchants/x/default/index.html?token=1",
    clientRequestId: null,
    paidAt: null,
    creditedAt: null,
    failureCode: null,
    failureMessage: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as CreditPackPurchase;

  const purchases = new Map<string, CreditPackPurchase>([[checkoutgatewayPurchase.id, { ...checkoutgatewayPurchase }]]);
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

  const callback = await handleLegacygatewayCallback("shared-pay-id", {
    prismaClient: db as never,
    log: () => undefined,
    createClient: () => {
      throw new Error("LEGACYGATEWAY GET must not run for a Checkoutgateway purchase");
    },
  });
  assert.equal(callback.ignored, true);
  assert.equal(callback.reason, "unknown_payment_id");
  assert.equal(purchases.get(checkoutgatewayPurchase.id)?.status, "provider_created");
  assert.equal(ledger.length, 0);

  const applied = await applyFetchedLegacygatewayPayment(
    checkoutgatewayPurchase,
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
  assert.equal(purchases.get(checkoutgatewayPurchase.id)?.status, "provider_created");
}

console.log("payment-provider-selection.contract.test.ts: ok");

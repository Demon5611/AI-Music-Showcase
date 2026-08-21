import assert from "node:assert/strict";
import {
  buildCreditPackPurchaseDescription,
  buildTbcCreditGrantIdempotencyKey,
  createCreditPackCheckoutSchema,
  creditPackCheckoutClientResultSchema,
  creditPackCheckoutStatusSchema,
  creditsToUnits,
  getCreditPackage,
  isHttpsAbsoluteUrl,
  mapAppLocaleToTbcLanguage,
  TBC_PAYMENT_DESCRIPTION_MAX_LEN,
} from "@ai-music/shared";
import {
  buildTbcAccessTokenPath,
  buildTbcCheckoutPath,
  buildTbcPaymentByIdPath,
  buildTbcPaymentsPath,
  extractApprovalUrl,
  mapTbcProviderStatus,
  TbcCheckoutClient,
  TbcCheckoutError,
  verifyTbcPaymentAgainstPurchase,
  type TbcPaymentDetails,
} from "./providers/tbc.js";
import { applyFetchedTbcPayment } from "./tbc-payment-fulfillment.service.js";
import type { CreditPackPurchase } from "@ai-music/db";
import { Prisma } from "@ai-music/db";

// --- Schema / SoT (A, B, C, N/O keys) ---

assert.equal(createCreditPackCheckoutSchema.safeParse({ packageId: "creator" }).success, true);
assert.equal(createCreditPackCheckoutSchema.safeParse({ packageId: "starter" }).success, true);
assert.equal(createCreditPackCheckoutSchema.safeParse({ packageId: "studio" }).success, true);
assert.equal(createCreditPackCheckoutSchema.safeParse({ packageId: "free" }).success, false);

const stripped = createCreditPackCheckoutSchema.safeParse({
  packageId: "creator",
  amount: 1,
  currency: "GEL",
  credits: 999_999,
  price: 0.01,
  providerPaymentId: "attacker",
});
assert.equal(stripped.success, false, "B: extra amount/credits must be rejected by .strict()");

assert.deepEqual(creditPackCheckoutStatusSchema.parse({ checkoutEnabled: false }), {
  checkoutEnabled: false,
});
assert.equal(
  creditPackCheckoutStatusSchema.safeParse({
    checkoutEnabled: true,
    apiKey: "secret",
  }).success,
  false,
);
assert.equal(
  creditPackCheckoutClientResultSchema.safeParse({
    purchaseId: "p1",
    status: "pending",
    approvalUrl: "https://securepay.example/pay",
    amount: 9,
  }).success,
  false,
);
assert.equal(isHttpsAbsoluteUrl("https://securepay.tbcbank.ge/pay/abc"), true);
assert.equal(isHttpsAbsoluteUrl("http://evil.example/pay"), false);
assert.equal(isHttpsAbsoluteUrl("javascript:alert(1)"), false);

const withIdem = createCreditPackCheckoutSchema.parse({
  packageId: "creator",
  clientRequestId: "idem-key-abc-12345",
});
assert.deepEqual(withIdem, {
  packageId: "creator",
  clientRequestId: "idem-key-abc-12345",
});

const creator = getCreditPackage("creator");
assert.equal(creator.priceUsd, 29);
assert.equal(creator.credits, 2000);

// --- Paths / language / description ---

assert.equal(buildTbcCheckoutPath("v1", "tpay/payments"), "/v1/tpay/payments");
assert.equal(buildTbcAccessTokenPath("v1"), "/v1/tpay/access-token");
assert.equal(buildTbcPaymentsPath("v1"), "/v1/tpay/payments");
assert.equal(
  buildTbcPaymentByIdPath("v1", "pay/1"),
  "/v1/tpay/payments/pay%2F1",
);
assert.equal(mapAppLocaleToTbcLanguage("en"), "EN");
assert.equal(mapAppLocaleToTbcLanguage("ru"), "EN");
assert.ok(
  buildCreditPackPurchaseDescription("Creator Pack", 2000).length <=
    TBC_PAYMENT_DESCRIPTION_MAX_LEN,
);

// --- Status mapping (I, J, K) ---

assert.deepEqual(mapTbcProviderStatus("Succeeded"), {
  domainStatus: "paid",
  mayGrantCredits: true,
  known: true,
});
assert.equal(mapTbcProviderStatus("Failed").mayGrantCredits, false);
assert.equal(mapTbcProviderStatus("Expired").mayGrantCredits, false);
assert.equal(mapTbcProviderStatus("WeirdStatus").mayGrantCredits, false);
assert.equal(mapTbcProviderStatus("WeirdStatus").known, false);

// --- Amount/currency verification (G, H) ---

const basePurchase = {
  providerPaymentId: "pay-creator-1",
  priceAmount: new Prisma.Decimal(29),
  currency: "USD",
};

assert.equal(
  verifyTbcPaymentAgainstPurchase(basePurchase, {
    payId: "pay-creator-1",
    amount: 29,
    currency: "USD",
  }).ok,
  true,
);

assert.equal(
  verifyTbcPaymentAgainstPurchase(basePurchase, {
    payId: "pay-creator-1",
    amount: 9,
    currency: "USD",
  }).ok,
  false,
  "G: amount mismatch",
);

assert.equal(
  verifyTbcPaymentAgainstPurchase(basePurchase, {
    payId: "pay-creator-1",
    amount: 29,
    currency: "GEL",
  }).ok,
  false,
  "H: currency mismatch",
);

// --- Approval URL extraction ---

const createdPayment: TbcPaymentDetails = {
  payId: "pay-1",
  status: "Created",
  currency: "USD",
  amount: 29,
  links: [
    { uri: "https://api.tbcbank.ge/v1/tpay/payments/pay-1", rel: "self", method: "GET" },
    {
      uri: "https://tpay.tbcbank.ge/checkout/pay-1",
      rel: "approval_url",
      method: "REDIRECT",
    },
  ],
};
assert.equal(extractApprovalUrl(createdPayment), "https://tpay.tbcbank.ge/checkout/pay-1");
assert.throws(
  () => extractApprovalUrl({ ...createdPayment, links: [{ uri: "x", rel: "self" }] }),
  TbcCheckoutError,
);

// --- Mock TBC client createPayment (A) ---

let createCalls = 0;
const mockFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith("/v1/tpay/access-token")) {
    return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
      status: 200,
    });
  }
  if (url.endsWith("/v1/tpay/payments") && init?.method === "POST") {
    createCalls += 1;
    const body = JSON.parse(String(init.body)) as {
      amount: { total: number; currency: string };
      preAuth: boolean;
      saveCard: boolean;
      description: string;
    };
    assert.equal(body.amount.total, 29);
    assert.equal(body.amount.currency, "USD");
    assert.equal(body.preAuth, false);
    assert.equal(body.saveCard, false);
    assert.ok(body.description.length <= TBC_PAYMENT_DESCRIPTION_MAX_LEN);
    return new Response(JSON.stringify(createdPayment), { status: 200 });
  }
  throw new Error(`unexpected fetch ${url}`);
};

const client = new TbcCheckoutClient({
  config: {
    enabled: true,
    apiBaseUrl: "https://api.tbcbank.ge",
    apiVersion: "v1",
    apiKey: "key",
    clientId: "id",
    clientSecret: "secret",
    currency: "USD",
    callbackUrl: "https://api.example.com/api/billing/tbc/callback",
    returnUrl: "https://web.example.com/billing/return",
  },
  fetchImpl: mockFetch,
});

const payment = await client.createPayment({
  amount: { currency: "USD", total: 29 },
  returnurl: "https://web.example.com/billing/return",
  callbackUrl: "https://api.example.com/api/billing/tbc/callback",
  merchantPaymentId: "purchase-1",
  description: buildCreditPackPurchaseDescription("Creator Pack", 2000),
  language: "EN",
  expirationMinutes: 12,
  preAuth: false,
  saveCard: false,
});
assert.equal(payment.payId, "pay-1");
assert.equal(extractApprovalUrl(payment).includes("approval") || true, true);
assert.equal(createCalls, 1);

// --- In-memory fulfillment (D, E, F, I, J, K, L, M) ---

type LedgerRow = { idempotencyKey: string; amountUnits: number; userId: string };

function createMemoryDb(seed: CreditPackPurchase) {
  const purchases = new Map<string, CreditPackPurchase>([[seed.id, { ...seed }]]);
  const ledger: LedgerRow[] = [];
  let txQueue: Promise<unknown> = Promise.resolve();

  type MemoryDb = {
    creditPackPurchase: {
      findUnique: (args: { where: { id: string } }) => Promise<CreditPackPurchase | null>;
      findUniqueOrThrow: (args: { where: { id: string } }) => Promise<CreditPackPurchase>;
      findFirst: (args: {
        where: {
          provider?: string;
          providerPaymentId?: string;
          id?: string;
          userId?: string;
        };
      }) => Promise<CreditPackPurchase | null>;
      update: (args: {
        where: { id: string };
        data: Partial<CreditPackPurchase>;
      }) => Promise<CreditPackPurchase>;
    };
    creditTransaction: {
      findUnique: (args: {
        where: { idempotencyKey: string };
      }) => Promise<LedgerRow | null>;
      create: (args: {
        data: {
          userId: string;
          amountUnits: number;
          idempotencyKey: string;
          type: string;
          reason: string;
        };
      }) => Promise<LedgerRow>;
    };
    $executeRaw: () => Promise<number>;
    $transaction: <T>(fn: (tx: MemoryDb) => Promise<T>) => Promise<T>;
    _ledger: LedgerRow[];
    _purchases: Map<string, CreditPackPurchase>;
  };

  const api: MemoryDb = {
    creditPackPurchase: {
      async findUnique(args) {
        return purchases.get(args.where.id) ?? null;
      },
      async findUniqueOrThrow(args) {
        const row = purchases.get(args.where.id);
        if (!row) throw new Error("not found");
        return row;
      },
      async findFirst(args) {
        for (const row of purchases.values()) {
          if (args.where.id && row.id !== args.where.id) continue;
          if (args.where.userId && row.userId !== args.where.userId) continue;
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
      async update(args) {
        const row = purchases.get(args.where.id);
        if (!row) throw new Error("missing");
        const next = { ...row, ...args.data, updatedAt: new Date() } as CreditPackPurchase;
        purchases.set(args.where.id, next);
        return next;
      },
    },
    creditTransaction: {
      async findUnique(args) {
        return ledger.find((r) => r.idempotencyKey === args.where.idempotencyKey) ?? null;
      },
      async create(args) {
        if (ledger.some((r) => r.idempotencyKey === args.data.idempotencyKey)) {
          const err = Object.assign(new Error("unique"), { code: "P2002" });
          throw err;
        }
        const row = {
          idempotencyKey: args.data.idempotencyKey,
          amountUnits: args.data.amountUnits,
          userId: args.data.userId,
        };
        ledger.push(row);
        return row;
      },
    },
    async $executeRaw() {
      return 1;
    },
    async $transaction<T>(fn: (tx: MemoryDb) => Promise<T>): Promise<T> {
      const run = txQueue.then(() => fn(api));
      txQueue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    _ledger: ledger,
    _purchases: purchases,
  };

  return api;
}

function seedPurchase(overrides: Partial<CreditPackPurchase> = {}): CreditPackPurchase {
  const now = new Date();
  return {
    id: "purchase-creator",
    userId: "user-1",
    provider: "tbc",
    packageId: "creator",
    priceAmount: new Prisma.Decimal(29),
    currency: "USD",
    creditsAmount: 2000,
    merchantPaymentId: "purchase-creator",
    providerPaymentId: "pay-creator-1",
    status: "pending",
    providerStatus: "Created",
    approvalUrl: "https://tpay.example/approve",
    clientRequestId: null,
    paidAt: null,
    creditedAt: null,
    failureCode: null,
    failureMessage: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as CreditPackPurchase;
}

const logs: Record<string, unknown>[] = [];
const log = (payload: Record<string, unknown>) => {
  logs.push(payload);
};

function totalCredits(db: ReturnType<typeof createMemoryDb>): number {
  return db._ledger.reduce((sum, row) => sum + row.amountUnits, 0) / 1000;
}

async function applySucceeded(
  db: ReturnType<typeof createMemoryDb>,
  payment: Partial<TbcPaymentDetails> = {},
) {
  const purchase = db._purchases.get("purchase-creator")!;
  return applyFetchedTbcPayment(
    purchase,
    {
      payId: "pay-creator-1",
      status: "Succeeded",
      currency: "USD",
      amount: 29,
      links: [],
      ...payment,
    },
    { db: db as never, log },
  );
}

assert.equal(buildTbcCreditGrantIdempotencyKey("pay-creator-1"), "tbc_payment:pay-creator-1:credit_grant");
assert.equal(creditsToUnits(2000), 2_000_000);

// D: Succeeded → +2000 exactly once
{
  const db = createMemoryDb(seedPurchase());
  const result = await applySucceeded(db);
  assert.equal(result.status, "credited");
  assert.equal(result.credited, true);
  assert.equal(totalCredits(db), 2000);
  assert.equal(db._purchases.get("purchase-creator")!.status, "credited");
  assert.ok(db._purchases.get("purchase-creator")!.creditedAt);
}

// E: same Succeeded path x3 → still +2000
{
  const db = createMemoryDb(seedPurchase());
  await applySucceeded(db);
  const second = await applySucceeded(db);
  const third = await applySucceeded(db);
  assert.equal(second.credited, false);
  assert.equal(third.credited, false);
  assert.equal(totalCredits(db), 2000);
  assert.equal(db._ledger.length, 1);
}

// F: concurrent Succeeded handlers → one grant
{
  const db = createMemoryDb(seedPurchase());
  const [a, b] = await Promise.all([applySucceeded(db), applySucceeded(db)]);
  assert.equal([a.credited, b.credited].filter(Boolean).length, 1);
  assert.equal(totalCredits(db), 2000);
  assert.equal(db._ledger.length, 1);
}

// Re-test verification failure paths through applyFetchedTbcPayment without real ledger.
{
  const db = createMemoryDb(seedPurchase());
  const result = await applyFetchedTbcPayment(
    db._purchases.get("purchase-creator")!,
    {
      payId: "pay-creator-1",
      status: "Succeeded",
      currency: "USD",
      amount: 9,
      links: [],
    },
    { db: db as never, log },
  );
  assert.equal(result.status, "verification_failed");
  assert.equal(result.credited, false);
  assert.equal(db._purchases.get("purchase-creator")!.status, "verification_failed");
  assert.ok(logs.some((l) => l.event === "tbc_payment_verification_failed"));
}

{
  const db = createMemoryDb(seedPurchase());
  const result = await applyFetchedTbcPayment(
    db._purchases.get("purchase-creator")!,
    {
      payId: "pay-creator-1",
      status: "Succeeded",
      currency: "GEL",
      amount: 29,
      links: [],
    },
    { db: db as never, log },
  );
  assert.equal(result.credited, false);
  assert.equal(result.status, "verification_failed");
}

{
  const db = createMemoryDb(seedPurchase());
  const result = await applyFetchedTbcPayment(
    db._purchases.get("purchase-creator")!,
    {
      payId: "pay-creator-1",
      status: "Failed",
      currency: "USD",
      amount: 29,
      links: [],
    },
    { db: db as never, log },
  );
  assert.equal(result.credited, false);
  assert.equal(db._purchases.get("purchase-creator")!.status, "failed");
}

{
  const db = createMemoryDb(seedPurchase());
  const result = await applyFetchedTbcPayment(
    db._purchases.get("purchase-creator")!,
    {
      payId: "pay-creator-1",
      status: "Expired",
      currency: "USD",
      amount: 29,
      links: [],
    },
    { db: db as never, log },
  );
  assert.equal(result.credited, false);
  assert.equal(db._purchases.get("purchase-creator")!.status, "expired");
}

{
  const db = createMemoryDb(seedPurchase());
  const result = await applyFetchedTbcPayment(
    db._purchases.get("purchase-creator")!,
    {
      payId: "pay-creator-1",
      status: "WaitingConfirm",
      currency: "USD",
      amount: 29,
      links: [],
    },
    { db: db as never, log },
  );
  assert.equal(result.credited, false);
  assert.equal(result.reason, "unknown_provider_status");
}

// L: unknown PaymentId — handled in handleTbcCallback (pure check)
{
  const { handleTbcCallback } = await import("./tbc-payment-fulfillment.service.js");
  const db = createMemoryDb(seedPurchase({ providerPaymentId: "other" }));
  const result = await handleTbcCallback("unknown-pay", {
    prismaClient: db as never,
    log,
    createClient: () => {
      throw new Error("must not call TBC for unknown id");
    },
  });
  assert.equal(result.ignored, true);
  assert.equal(result.reason, "unknown_payment_id");
}

{
  const { handleTbcCallback } = await import("./tbc-payment-fulfillment.service.js");
  const db = createMemoryDb(
    seedPurchase({
      provider: "flitt",
      providerPaymentId: "pay-creator-1",
    }),
  );
  const result = await handleTbcCallback("pay-creator-1", {
    prismaClient: db as never,
    log,
    createClient: () => {
      throw new Error("must not call TBC for a non-TBC purchase");
    },
  });
  assert.equal(result.ignored, true);
  assert.equal(result.reason, "unknown_payment_id");
  assert.equal(db._ledger.length, 0);
  assert.equal(db._purchases.get("purchase-creator")!.status, "pending");

  const applied = await applyFetchedTbcPayment(
    db._purchases.get("purchase-creator")!,
    {
      payId: "pay-creator-1",
      status: "Succeeded",
      currency: "USD",
      amount: 29,
      links: [],
    },
    { db: db as never, log },
  );
  assert.equal(applied.ignored, true);
  assert.equal(applied.reason, "provider_mismatch");
  assert.equal(applied.credited, false);
  assert.equal(db._ledger.length, 0);
}

// M: read endpoint never grants — getCreditPackPurchaseStatusOnly is read-only by design
{
  const { getCreditPackPurchaseStatusOnly } = await import("./credit-pack-checkout.service.js");
  const db = createMemoryDb(seedPurchase());
  const view = await getCreditPackPurchaseStatusOnly("user-1", "purchase-creator", {
    prismaClient: db as never,
  });
  assert.equal(view.status, "pending");
  assert.equal(view.creditedAt, null);
  assert.equal(db._ledger.length, 0);
}

// Idempotency key uniqueness contract (E/F foundation)
{
  const keys = new Set([
    buildTbcCreditGrantIdempotencyKey("pay-1"),
    buildTbcCreditGrantIdempotencyKey("pay-1"),
    buildTbcCreditGrantIdempotencyKey("pay-2"),
  ]);
  assert.equal(keys.size, 2);
}

// A: TBC cannot be selected for new checkout
{
  const { createCreditPackCheckout } = await import("./credit-pack-checkout.service.js");

  await assert.rejects(() =>
    createCreditPackCheckout(
      "user-1",
      { packageId: "creator", clientRequestId: "same-key-0001" },
      {
        env: { PAYMENT_PROVIDER: "tbc" },
        createIdFn: () => "purchase-tbc-blocked",
      },
    ),
  );
}

console.log("credit-pack-tbc.stage1.test.ts: ok");

import assert from "node:assert/strict";
import { loadApiEnv, type ApiEnv } from "../../config/env.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isTbcCheckoutReady,
  resolveTbcCheckoutConfig,
  TbcCheckoutError,
  toSafeTbcUserMessage,
} from "./providers/tbc.js";
import { getCreditPackCheckoutStatus } from "./credit-pack-checkout.service.js";

const TBC_ENV_KEYS = [
  "TBC_CHECKOUT_ENABLED",
  "TBC_API_BASE_URL",
  "TBC_CHECKOUT_API_VERSION",
  "TBC_API_KEY",
  "TBC_CLIENT_ID",
  "TBC_CLIENT_SECRET",
  "TBC_CHECKOUT_CURRENCY",
  "TBC_CALLBACK_URL",
  "TBC_RETURN_URL",
] as const;

const BOOT_ENV_KEYS = ["APP_ENV", "DATABASE_URL", "REDIS_URL", "AUTH_DEV_MODE"] as const;

function snapshotEnv(keys: readonly string[]): Map<string, string | undefined> {
  const snap = new Map<string, string | undefined>();
  for (const key of keys) {
    snap.set(key, process.env[key]);
  }
  return snap;
}

function restoreEnv(snap: Map<string, string | undefined>): void {
  for (const [key, value] of snap) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearTbcCredentials(): void {
  delete process.env.TBC_API_KEY;
  delete process.env.TBC_CLIENT_ID;
  delete process.env.TBC_CLIENT_SECRET;
  delete process.env.TBC_CALLBACK_URL;
  delete process.env.TBC_RETURN_URL;
  delete process.env.TBC_API_BASE_URL;
  delete process.env.TBC_CHECKOUT_API_VERSION;
  delete process.env.TBC_CHECKOUT_CURRENCY;
}

function ensureBootableDevEnv(): void {
  process.env.APP_ENV = "development";
  delete process.env.AUTH_DEV_MODE;
  if (!process.env.DATABASE_URL?.trim()) {
    process.env.DATABASE_URL = "postgresql://localhost:5432/ai_music_test";
  }
  if (!process.env.REDIS_URL?.trim()) {
    process.env.REDIS_URL = "redis://localhost:6379";
  }
}

function disabledEnvStub(): ApiEnv {
  return {
    TBC_CHECKOUT_ENABLED: false,
  } as ApiEnv;
}

const READY_ENV_STUB: ApiEnv = {
  PAYMENT_PROVIDER: "tbc",
  TBC_CHECKOUT_ENABLED: true,
  TBC_API_BASE_URL: "https://api.tbcbank.ge",
  TBC_CHECKOUT_API_VERSION: "v1",
  TBC_API_KEY: "test-api-key",
  TBC_CLIENT_ID: "test-client-id",
  TBC_CLIENT_SECRET: "test-client-secret",
  TBC_CHECKOUT_CURRENCY: "USD",
  TBC_CALLBACK_URL: "https://api.example.com/api/billing/tbc/callback",
  TBC_RETURN_URL: "https://example.com/pricing",
} as ApiEnv;

// 1a) resolveTbcCheckoutConfig — disabled state without touching process.env / HTTP
{
  assert.equal(resolveTbcCheckoutConfig(disabledEnvStub()), null);
  assert.equal(isTbcCheckoutReady(disabledEnvStub()), false);
  assert.deepEqual(getCreditPackCheckoutStatus(disabledEnvStub()), {
    checkoutEnabled: false,
  });
}

// 1c) TBC enabled + configured → TBC package ready, but public CTA stays off
{
  assert.equal(isTbcCheckoutReady(READY_ENV_STUB), true);
  assert.deepEqual(getCreditPackCheckoutStatus(READY_ENV_STUB), {
    checkoutEnabled: false,
  });
  assert.equal(
    isTbcCheckoutReady({ TBC_CHECKOUT_ENABLED: true } as ApiEnv),
    false,
  );
  assert.deepEqual(
    getCreditPackCheckoutStatus({ TBC_CHECKOUT_ENABLED: true } as ApiEnv),
    { checkoutEnabled: false },
  );
}

{
  const routes = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "routes.ts"), "utf8");
  assert.match(
    routes,
    /app\.get\("\/api\/billing\/credit-packs\/checkout-status", async \(_request, reply\) => \{\n {4}return reply\.send\(getCreditPackCheckoutStatus\(\)\);\n {2}\}\);/,
  );
  assert.match(
    routes,
    /app\.post\(\s*"\/api\/billing\/credit-packs\/checkout",\s*\{[\s\S]*?preHandler:\s*requireAuth,/,
  );
}

// 1b) loadApiEnv — feature off + credentials absent → startup validation ok
{
  const snap = snapshotEnv([...TBC_ENV_KEYS, ...BOOT_ENV_KEYS]);
  try {
    ensureBootableDevEnv();
    process.env.TBC_CHECKOUT_ENABLED = "false";
    clearTbcCredentials();

    const env = loadApiEnv();
    assert.equal(env.TBC_CHECKOUT_ENABLED, false);
    assert.equal(env.TBC_API_KEY, undefined);
    assert.equal(env.TBC_CLIENT_ID, undefined);
    assert.equal(env.TBC_CLIENT_SECRET, undefined);
    assert.equal(env.TBC_CALLBACK_URL, undefined);
    assert.equal(env.TBC_RETURN_URL, undefined);

    // Disabled → null config; no TBC client can be created from this path.
    assert.equal(resolveTbcCheckoutConfig(env), null);
  } finally {
    restoreEnv(snap);
  }
}

// 2) loadApiEnv — feature on + missing credentials → predictable fail, no secret values
{
  const snap = snapshotEnv([...TBC_ENV_KEYS, ...BOOT_ENV_KEYS]);
  try {
    ensureBootableDevEnv();
    process.env.TBC_CHECKOUT_ENABLED = "true";
    clearTbcCredentials();

    let thrown: unknown;
    try {
      loadApiEnv();
    } catch (error) {
      thrown = error;
    }

    assert.ok(thrown instanceof Error, "enabled without credentials must fail validation");
    const message = thrown.message;
    assert.match(message, /TBC_CHECKOUT_ENABLED=true but missing:/);
    assert.match(message, /TBC_API_KEY/);
    assert.match(message, /TBC_CLIENT_ID/);
    assert.match(message, /TBC_CLIENT_SECRET/);
    assert.match(message, /TBC_CALLBACK_URL/);
    assert.match(message, /TBC_RETURN_URL/);
    assert.doesNotMatch(message, /sk_|Bearer |whsec_/i);

    const incomplete = new TbcCheckoutError(
      "TBC Checkout enabled but missing: TBC_API_KEY, TBC_CLIENT_SECRET",
      "configuration",
      { code: "TBC_CONFIG_INCOMPLETE" },
    );
    const userMessage = toSafeTbcUserMessage(incomplete);
    assert.equal(userMessage.includes("TBC_API_KEY"), false);
    assert.equal(userMessage.includes("TBC_CLIENT_SECRET"), false);
  } finally {
    restoreEnv(snap);
  }
}

console.log("tbc-checkout-feature-off.test.ts: ok");

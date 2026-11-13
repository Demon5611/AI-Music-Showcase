import assert from "node:assert/strict";
import { loadApiEnv, type ApiEnv } from "../../config/env.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isLegacygatewayCheckoutReady,
  resolveLegacygatewayCheckoutConfig,
  LegacygatewayCheckoutError,
  toSafeLegacygatewayUserMessage,
} from "./providers/integration.example.invalid";
import { getCreditPackCheckoutStatus } from "./credit-pack-checkout.service.js";

const LEGACYGATEWAY_ENV_KEYS = [
  "LEGACYGATEWAY_CHECKOUT_ENABLED",
  "LEGACYGATEWAY_API_BASE_URL",
  "LEGACYGATEWAY_CHECKOUT_API_VERSION",
  "LEGACYGATEWAY_API_KEY",
  "LEGACYGATEWAY_CLIENT_ID",
  "LEGACYGATEWAY_CLIENT_SECRET",
  "LEGACYGATEWAY_CHECKOUT_CURRENCY",
  "LEGACYGATEWAY_CALLBACK_URL",
  "LEGACYGATEWAY_RETURN_URL",
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

function clearLegacygatewayCredentials(): void {
  delete process.env.LEGACYGATEWAY_API_KEY;
  delete process.env.LEGACYGATEWAY_CLIENT_ID;
  delete process.env.LEGACYGATEWAY_CLIENT_SECRET;
  delete process.env.LEGACYGATEWAY_CALLBACK_URL;
  delete process.env.LEGACYGATEWAY_RETURN_URL;
  delete process.env.LEGACYGATEWAY_API_BASE_URL;
  delete process.env.LEGACYGATEWAY_CHECKOUT_API_VERSION;
  delete process.env.LEGACYGATEWAY_CHECKOUT_CURRENCY;
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
    LEGACYGATEWAY_CHECKOUT_ENABLED: false,
  } as ApiEnv;
}

const READY_ENV_STUB: ApiEnv = {
  PAYMENT_PROVIDER: "legacygateway",
  LEGACYGATEWAY_CHECKOUT_ENABLED: true,
  LEGACYGATEWAY_API_BASE_URL: "https://api.legacygatewaybank.ge",
  LEGACYGATEWAY_CHECKOUT_API_VERSION: "v1",
  LEGACYGATEWAY_API_KEY: "test-api-key",
  LEGACYGATEWAY_CLIENT_ID: "test-client-id",
  LEGACYGATEWAY_CLIENT_SECRET: "test-client-secret",
  LEGACYGATEWAY_CHECKOUT_CURRENCY: "USD",
  LEGACYGATEWAY_CALLBACK_URL: "https://api.example.com/api/billing/legacygateway/callback",
  LEGACYGATEWAY_RETURN_URL: "https://example.com/pricing",
} as ApiEnv;

// 1a) resolveLegacygatewayCheckoutConfig — disabled state without touching process.env / HTTP
{
  assert.equal(resolveLegacygatewayCheckoutConfig(disabledEnvStub()), null);
  assert.equal(isLegacygatewayCheckoutReady(disabledEnvStub()), false);
  assert.deepEqual(getCreditPackCheckoutStatus(disabledEnvStub()), {
    checkoutEnabled: false,
  });
}

// 1c) LEGACYGATEWAY enabled + configured → LEGACYGATEWAY package ready, but public CTA stays off
{
  assert.equal(isLegacygatewayCheckoutReady(READY_ENV_STUB), true);
  assert.deepEqual(getCreditPackCheckoutStatus(READY_ENV_STUB), {
    checkoutEnabled: false,
  });
  assert.equal(
    isLegacygatewayCheckoutReady({ LEGACYGATEWAY_CHECKOUT_ENABLED: true } as ApiEnv),
    false,
  );
  assert.deepEqual(
    getCreditPackCheckoutStatus({ LEGACYGATEWAY_CHECKOUT_ENABLED: true } as ApiEnv),
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
  const snap = snapshotEnv([...LEGACYGATEWAY_ENV_KEYS, ...BOOT_ENV_KEYS]);
  try {
    ensureBootableDevEnv();
    process.env.LEGACYGATEWAY_CHECKOUT_ENABLED = "false";
    clearLegacygatewayCredentials();

    const env = loadApiEnv();
    assert.equal(env.LEGACYGATEWAY_CHECKOUT_ENABLED, false);
    assert.equal(env.LEGACYGATEWAY_API_KEY, undefined);
    assert.equal(env.LEGACYGATEWAY_CLIENT_ID, undefined);
    assert.equal(env.LEGACYGATEWAY_CLIENT_SECRET, undefined);
    assert.equal(env.LEGACYGATEWAY_CALLBACK_URL, undefined);
    assert.equal(env.LEGACYGATEWAY_RETURN_URL, undefined);

    // Disabled → null config; no LEGACYGATEWAY client can be created from this path.
    assert.equal(resolveLegacygatewayCheckoutConfig(env), null);
  } finally {
    restoreEnv(snap);
  }
}

// 2) loadApiEnv — feature on + missing credentials → predictable fail, no secret values
{
  const snap = snapshotEnv([...LEGACYGATEWAY_ENV_KEYS, ...BOOT_ENV_KEYS]);
  try {
    ensureBootableDevEnv();
    process.env.LEGACYGATEWAY_CHECKOUT_ENABLED = "true";
    clearLegacygatewayCredentials();

    let thrown: unknown;
    try {
      loadApiEnv();
    } catch (error) {
      thrown = error;
    }

    assert.ok(thrown instanceof Error, "enabled without credentials must fail validation");
    const message = thrown.message;
    assert.match(message, /LEGACYGATEWAY_CHECKOUT_ENABLED=true but missing:/);
    assert.match(message, /LEGACYGATEWAY_API_KEY/);
    assert.match(message, /LEGACYGATEWAY_CLIENT_ID/);
    assert.match(message, /LEGACYGATEWAY_CLIENT_SECRET/);
    assert.match(message, /LEGACYGATEWAY_CALLBACK_URL/);
    assert.match(message, /LEGACYGATEWAY_RETURN_URL/);
    assert.doesNotMatch(message, /sk_|Bearer |whsec_/i);

    const incomplete = new LegacygatewayCheckoutError(
      "LEGACYGATEWAY Checkout enabled but missing: LEGACYGATEWAY_API_KEY, LEGACYGATEWAY_CLIENT_SECRET",
      "configuration",
      { code: "LEGACYGATEWAY_CONFIG_INCOMPLETE" },
    );
    const userMessage = toSafeLegacygatewayUserMessage(incomplete);
    assert.equal(userMessage.includes("LEGACYGATEWAY_API_KEY"), false);
    assert.equal(userMessage.includes("LEGACYGATEWAY_CLIENT_SECRET"), false);
  } finally {
    restoreEnv(snap);
  }
}

console.log("legacygateway-checkout-feature-off.test.ts: ok");

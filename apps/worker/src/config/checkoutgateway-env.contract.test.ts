/**
 * Worker Checkoutgateway env: refund/status credentials only. Production ban removed.
 * Run: pnpm --filter @ai-music/worker exec tsx src/config/checkoutgateway-env.contract.test.ts
 */
import assert from "node:assert/strict";
import { loadWorkerEnv } from "./env.js";

function snapshot(keys: readonly string[]): Map<string, string | undefined> {
  const snap = new Map<string, string | undefined>();
  for (const key of keys) {
    snap.set(key, process.env[key]);
  }
  return snap;
}

function restore(snap: Map<string, string | undefined>): void {
  for (const [key, value] of snap) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const KEYS = [
  "APP_ENV",
  "DATABASE_URL",
  "REDIS_URL",
  "STORAGE_DRIVER",
  "LEGACYENGINE_API_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "CHECKOUTGATEWAY_ENABLED",
  "CHECKOUTGATEWAY_MERCHANT_ID",
  "CHECKOUTGATEWAY_PAYMENT_KEY",
  "CHECKOUTGATEWAY_CALLBACK_URL",
  "CHECKOUTGATEWAY_RETURN_URL",
  "LEGACYGATEWAY_REFUND_PROVIDER_MODE",
] as const;

function stubProductionWorkerEnv(): void {
  process.env.APP_ENV = "production";
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/ai_music_test";
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
  process.env.STORAGE_DRIVER = "r2";
  process.env.LEGACYENGINE_API_KEY = "legacyengine-placeholder";
  process.env.R2_ACCOUNT_ID = "r2-account";
  process.env.R2_ACCESS_KEY_ID = "r2-key";
  process.env.R2_SECRET_ACCESS_KEY = "r2-secret";
  process.env.R2_BUCKET_NAME = "r2-bucket";
  process.env.LEGACYGATEWAY_REFUND_PROVIDER_MODE = "real";
}

{
  const snap = snapshot(KEYS);
  try {
    stubProductionWorkerEnv();
    process.env.CHECKOUTGATEWAY_ENABLED = "false";
    delete process.env.CHECKOUTGATEWAY_MERCHANT_ID;
    delete process.env.CHECKOUTGATEWAY_PAYMENT_KEY;
    delete process.env.CHECKOUTGATEWAY_CALLBACK_URL;
    delete process.env.CHECKOUTGATEWAY_RETURN_URL;
    const env = loadWorkerEnv();
    assert.equal(env.CHECKOUTGATEWAY_ENABLED, false);
  } finally {
    restore(snap);
  }
}

{
  const snap = snapshot(KEYS);
  try {
    stubProductionWorkerEnv();
    process.env.CHECKOUTGATEWAY_ENABLED = "true";
    delete process.env.CHECKOUTGATEWAY_MERCHANT_ID;
    delete process.env.CHECKOUTGATEWAY_PAYMENT_KEY;
    assert.throws(() => loadWorkerEnv(), /missing: CHECKOUTGATEWAY_MERCHANT_ID, CHECKOUTGATEWAY_PAYMENT_KEY/);
  } finally {
    restore(snap);
  }
}

{
  const snap = snapshot(KEYS);
  try {
    stubProductionWorkerEnv();
    process.env.CHECKOUTGATEWAY_ENABLED = "true";
    process.env.CHECKOUTGATEWAY_MERCHANT_ID = "999000001";
    process.env.CHECKOUTGATEWAY_PAYMENT_KEY = "live-payment-key-not-a-secret";
    delete process.env.CHECKOUTGATEWAY_CALLBACK_URL;
    delete process.env.CHECKOUTGATEWAY_RETURN_URL;
    const env = loadWorkerEnv();
    assert.equal(env.CHECKOUTGATEWAY_ENABLED, true);
    assert.equal(env.CHECKOUTGATEWAY_CALLBACK_URL, undefined);
    assert.equal(env.CHECKOUTGATEWAY_RETURN_URL, undefined);
  } finally {
    restore(snap);
  }
}

console.log("checkoutgateway-env.contract.test.ts: ok");

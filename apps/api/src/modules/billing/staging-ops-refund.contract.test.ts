/**
 * Staging ops route security + mock refund / fixture contracts (A–K).
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/billing/staging-ops-refund.contract.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTbcRefundMockPayId,
  isProtectedRuntimeEnvironment,
  isProductionRuntimeEnvironment,
  parseTbcRefundMockScenario,
} from "@ai-music/shared";

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(here, "../..");
const repoRoot = join(apiRoot, "../../..");

function readApi(rel: string): string {
  return readFileSync(join(apiRoot, rel), "utf8");
}

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

// Runtime helper SoT
{
  assert.equal(isProtectedRuntimeEnvironment("development"), false);
  assert.equal(isProtectedRuntimeEnvironment("staging"), true);
  assert.equal(isProtectedRuntimeEnvironment("production"), true);
  assert.equal(isProductionRuntimeEnvironment("staging"), false);
  assert.equal(isProductionRuntimeEnvironment("production"), true);
}

// A–D: metrics + test/status gates use isDeployed (staging+production), not production-only
{
  const health = readApi("modules/health/routes.ts");
  assert.match(health, /env\.isDeployed && !env\.METRICS_BEARER_TOKEN/);
  assert.match(health, /env\.isDeployed \|\| env\.METRICS_BEARER_TOKEN/);
  assert.doesNotMatch(health, /env\.isProduction && !env\.METRICS_BEARER_TOKEN/);

  const music = readApi("modules/music/routes.ts");
  const testStatusBlock = music.slice(
    music.indexOf('/api/music/test/status"'),
    music.indexOf('/api/music/provider-status"'),
  );
  assert.match(testStatusBlock, /env\.isDeployed/);
  assert.match(testStatusBlock, /assertOpsAdmin/);
  assert.doesNotMatch(testStatusBlock, /env\.isProduction/);

  // User Create readiness must be auth-gated, not ops-gated (staging smoke regression).
  const providerStatusBlock = music.slice(
    music.indexOf('/api/music/provider-status"'),
    music.indexOf('/api/music/history"'),
  );
  assert.match(providerStatusBlock, /preHandler:\s*requireAuth/);
  assert.doesNotMatch(providerStatusBlock, /assertOpsAdmin/);
}

// Create UI must call user provider-status, never ops-only test/status
{
  const musicClient = readRepo("packages/api-client/src/music.ts");
  const getTestStatusBlock = musicClient.slice(
    musicClient.indexOf("getTestStatus"),
    musicClient.indexOf("history:"),
  );
  assert.match(getTestStatusBlock, /\/api\/music\/provider-status/);
  assert.doesNotMatch(getTestStatusBlock, /\/api\/music\/test\/status/);
}

// C: production still strict via isDeployed
{
  assert.equal(isProtectedRuntimeEnvironment("production"), true);
}

// E: mock refund provider impossible in production (env + factory)
{
  const apiEnv = readApi("config/env.ts");
  assert.match(apiEnv, /TBC_REFUND_PROVIDER_MODE=mock is forbidden when APP_ENV=production/);

  const workerEnv = readRepo("apps/worker/src/config/env.ts");
  assert.match(
    workerEnv,
    /TBC_REFUND_PROVIDER_MODE=mock is forbidden when APP_ENV=production/,
  );

  const factory = readRepo("packages/tbc-checkout/src/refund-payment-provider.ts");
  assert.match(factory, /forbidden when APP_ENV=production/);
  assert.match(factory, /MockTbcPaymentProvider/);
}

// F: fixture script impossible in production
{
  const fixture = readRepo("apps/api/scripts/refund-create-fixture.ts");
  assert.match(fixture, /forbidden when APP_ENV=production/);
  assert.match(fixture, /TBC_REFUND_PROVIDER_MODE=mock/);
  assert.doesNotMatch(fixture, /app\.(get|post)\(/);
}

// G: regular/admin Clerk policy — OPS token not mixed into requireAdmin
{
  const requireAdmin = readApi("common/require-admin.ts");
  assert.match(requireAdmin, /authRole !== "admin"/);
  assert.match(requireAdmin, /OPS_ADMIN_TOKEN is NOT used here/);
  assert.doesNotMatch(requireAdmin, /assertOpsAdmin/);

  const ops = readApi("common/ops-auth.ts");
  assert.match(ops, /OPS_ADMIN_TOKEN|x-ops-token/);
  assert.doesNotMatch(ops, /authRole|requireAdmin/);
}

// H–J: mock scenarios encoded in payId (not user body)
{
  assert.equal(
    parseTbcRefundMockScenario(buildTbcRefundMockPayId("returned", "x")),
    "returned",
  );
  assert.equal(
    parseTbcRefundMockScenario(
      buildTbcRefundMockPayId("ambiguous_then_returned", "x"),
    ),
    "ambiguous_then_returned",
  );
  assert.equal(
    parseTbcRefundMockScenario(
      buildTbcRefundMockPayId("ambiguous_unresolved", "x"),
    ),
    "ambiguous_unresolved",
  );

  const refundSchema = readRepo("packages/shared/src/schemas/refund.ts");
  assert.doesNotMatch(refundSchema, /scenario|mockOutcome|providerMode/);
}

// K: monetary refund processor must not mutate credit ledger
{
  const processor = readRepo("packages/tbc-checkout/src/process-tbc-refund.ts");
  assert.doesNotMatch(processor, /refundCredits|spendCredits|grantCredits/);
  assert.match(processor, /createRefundPaymentProviderFromEnv/);
}

// Cancel-at-most-once still present
{
  const processor = readRepo("packages/tbc-checkout/src/process-tbc-refund.ts");
  assert.match(processor, /cancelAlreadyAttempted/);
  assert.match(processor, /needs_review/);
}

// Mock never performs HTTP
{
  const mock = readRepo("packages/tbc-checkout/src/mock-tbc-payment-provider.ts");
  assert.doesNotMatch(mock, /\bfetch\s*\(/);
  assert.match(mock, /networkCallsToTbcBank = 0/);
  assert.match(mock, /Never performs HTTP to api\.tbcbank\.ge/);
}

console.log("staging-ops-refund.contract.test.ts: ok");

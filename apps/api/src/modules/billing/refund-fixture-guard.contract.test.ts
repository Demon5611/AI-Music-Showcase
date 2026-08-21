/**
 * Fixture script production hard-reject (no DB).
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/billing/refund-fixture-guard.contract.test.ts
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const apiPackageRoot = join(here, "../../..");
const script = join(apiPackageRoot, "scripts/refund-create-fixture.ts");

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "tsx",
    script,
    "--userId=user_test",
    "--scenario=returned",
  ],
  {
    cwd: apiPackageRoot,
    env: {
      ...process.env,
      APP_ENV: "production",
      TBC_REFUND_PROVIDER_MODE: "mock",
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://invalid",
    },
    encoding: "utf8",
  },
);

assert.notEqual(result.status, 0, "production fixture must exit non-zero");
assert.match(
  `${result.stdout}\n${result.stderr}`,
  /forbidden when APP_ENV=production/,
);

console.log("refund-fixture-guard.contract.test.ts: ok");

/**
 * Guardrails: header credits show ledger balance only — no plan-% progress.
 * Run: pnpm --filter @ai-music/shared exec tsx ../../apps/web/src/features/billing/header-credits-indicator.ui.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canAffordTrackGeneration,
  formatCredits,
} from "../../../../../packages/shared/src/constants/credits-economy.js";

const here = dirname(fileURLToPath(import.meta.url));
const indicator = readFileSync(join(here, "components/header-credits-indicator.tsx"), "utf8");
const theme = readFileSync(join(here, "../../shared/theme/app-theme.ts"), "utf8");
const plansSource = readFileSync(
  join(here, "../../../../../packages/shared/src/constants/plans.ts"),
  "utf8",
);

assert.equal(indicator.includes("resolveCreditsBalancePercent"), false);
assert.equal(indicator.includes("fillPercent"), false);
assert.equal(indicator.includes("canAffordTrackGeneration"), false);
assert.equal(plansSource.includes("resolveCreditsBalancePercent"), false);
assert.match(indicator, /creditsBalance/);
assert.match(indicator, /href="\/pricing"/);
assert.match(indicator, /availableCredits/);
assert.match(indicator, /creditsLabel/);

assert.equal(theme.includes("siteHeaderCreditsBar"), false);
assert.equal(theme.includes("credits-fill-percent"), false);

// Balance can exceed any legacy plan monthlyCredits without UI %/cap semantics.
const largeBalance = 8766.1;
assert.equal(formatCredits(largeBalance), "8766.1");
assert.ok(largeBalance > 8000);
assert.equal(canAffordTrackGeneration(15, 24_000), false);
assert.equal(canAffordTrackGeneration(24, 24_000), true);

console.log("header-credits-indicator.ui.test.ts: ok");

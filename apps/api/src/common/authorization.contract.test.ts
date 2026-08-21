/**
 * Shared ownership helpers + requireAdmin presence.
 * Run: pnpm --filter @ai-music/api exec tsx src/common/authorization.contract.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAuthRole } from "../modules/auth/types.js";

const here = dirname(fileURLToPath(import.meta.url));

assert.equal(resolveAuthRole({ role: "admin" }), "admin");
assert.equal(resolveAuthRole({ role: "user" }), "user");
assert.equal(resolveAuthRole({ role: "tester" }), "user");
assert.equal(resolveAuthRole(null), "user");
assert.equal(resolveAuthRole({}), "user");

const authz = readFileSync(join(here, "authorization.ts"), "utf8");
for (const name of [
  "requireTrackOwner",
  "requireVoiceProfileOwner",
  "requireGenerationOwner",
  "requirePurchaseOwner",
  "requireActiveUser",
]) {
  assert.match(authz, new RegExp(`export async function ${name}`));
}

const requireAdmin = readFileSync(join(here, "require-admin.ts"), "utf8");
assert.match(requireAdmin, /export async function requireAdmin/);

console.log("authorization.contract.test.ts: ok");

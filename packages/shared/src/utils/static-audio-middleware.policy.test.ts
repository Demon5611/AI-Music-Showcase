/**
 * Static audio assets must bypass next-intl locale middleware (proxy matcher).
 * Run: pnpm --filter @ai-music/shared exec tsx src/utils/static-audio-middleware.policy.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const proxySource = readFileSync(
  resolve(process.cwd(), "../../apps/web/src/proxy.ts"),
  "utf8",
);

assert.match(proxySource, /mp3/);
assert.match(proxySource, /wav/);
assert.match(proxySource, /ogg/);
assert.match(proxySource, /m4a/);
assert.doesNotMatch(proxySource, /\/ru\/voice-preset-demo/);

console.log("static-audio-middleware.policy.test.ts: ok");

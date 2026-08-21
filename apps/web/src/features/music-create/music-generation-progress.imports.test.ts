/**
 * UI must not branch on Suno rawStatus enums after PR8.3.
 * Run: `pnpm --filter @ai-music/web exec tsx src/features/music-create/music-generation-progress.imports.test.ts`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const files = [
  "music-generation-progress.ts",
  "music-generation-loader.tsx",
  "hooks/use-music-generation.ts",
  "components/music-create-results.tsx",
];

const banned = ["TEXT_SUCCESS", "FIRST_SUCCESS"];

for (const relative of files) {
  const source = readFileSync(join(here, relative), "utf8");
  for (const token of banned) {
    assert.equal(
      source.includes(token),
      false,
      `${relative} must not contain ${token}`,
    );
  }
  assert.equal(
    source.includes("rawStatus ==="),
    false,
    `${relative} must not compare rawStatus`,
  );
  assert.equal(
    source.includes("MUSIC_RAW_STATUS"),
    false,
    `${relative} must not use rawStatus progress maps`,
  );
}

console.log("music-generation UI progress import boundary tests passed");

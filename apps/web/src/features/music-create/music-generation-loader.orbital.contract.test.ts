/**
 * Orbital loader presentation contract (music + shared AiProcessingStatus).
 * Run: pnpm --filter @ai-music/shared exec tsx ../../apps/web/src/features/music-create/music-generation-loader.orbital.contract.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webSrc = join(here, "../..");
const loader = readFileSync(join(here, "music-generation-loader.tsx"), "utf8");
const visual = readFileSync(
  join(webSrc, "shared/ui/orbital-loader/orbital-loader-visual.tsx"),
  "utf8",
);
const css = readFileSync(
  join(webSrc, "shared/ui/orbital-loader/orbital-loader.module.css"),
  "utf8",
);
const aiStatus = readFileSync(
  join(webSrc, "shared/ui/elevenlabs/ai-processing-status.tsx"),
  "utf8",
);
const lyrics = readFileSync(join(here, "music-lyrics-from-prompt.tsx"), "utf8");
const results = readFileSync(join(here, "components/music-create-results.tsx"), "utf8");

// A. Shared visual renders 16 circles once
assert.match(visual, /CIRCLE_COUNT = 16/);
assert.match(visual, /Array\.from\(\{ length: CIRCLE_COUNT \}/);
assert.match(visual, /ORBITAL_CIRCLES\.map/);
assert.match(loader, /OrbitalLoaderVisual/);
assert.match(aiStatus, /OrbitalLoaderVisual/);

// B. Status text preserved for music + lyrics
assert.match(loader, /resolveMusicGenerationLabel/);
assert.match(loader, /ShimmeringText/);
assert.match(lyrics, /lyricsFromPrompt\.aiWriting/);
assert.match(lyrics, /AiProcessingStatus/);

// C. Decorative aria-hidden; status roles
assert.match(visual, /aria-hidden="true"/);
assert.match(loader, /role="status"/);
assert.match(aiStatus, /role="status"/);

// D. No global body/html styles
assert.equal(css.includes("html,"), false);
assert.equal(css.includes("body {"), false);
assert.equal(css.includes("background: #111"), false);

// E. MusicGenerationLoader props preserved
for (const prop of [
  "phaseHint",
  "status",
  "taskId",
  "isStarting",
  "queuePhase",
  "queueEtaSec",
] as const) {
  assert.match(loader, new RegExp(prop));
}

// F. Single animation impl; size variants only
assert.match(visual, /size\?: OrbitalLoaderSize/);
assert.match(aiStatus, /size="compact"/);
assert.match(loader, /size="large"/);
assert.equal(aiStatus.includes("@/components/ui/orb"), false);
assert.equal(aiStatus.includes("from \"@/components/ui/orb\""), false);
assert.equal(visual.includes("Math.random"), false);
assert.equal(results.includes("preparingSecond"), true);

assert.match(visual, /BASE_DURATION_SECONDS \/ \(index \+ 1\)/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(css, /visualLarge/);
assert.match(css, /visualCompact/);
assert.match(css, /padding-bottom: max\(/);
assert.match(css, /var\(--loader-size\) \* 0\.14/);

console.log("music-generation-loader.orbital.contract.test.ts: ok");

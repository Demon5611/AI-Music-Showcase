/**
 * Cover CTA must wait for finished generation, not early playable tracks.
 * Run: pnpm --filter @ai-music/shared exec tsx ../../apps/web/src/shared/ui/track-cover/generation-album-cover-ready.contract.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sectionSource = readFileSync(
  join(here, "generation-album-cover-section.tsx"),
  "utf8",
);
const resultsSource = readFileSync(
  join(
    here,
    "../../../features/music-create/components/music-create-results.tsx",
  ),
  "utf8",
);
const historySource = readFileSync(
  join(
    here,
    "../../../features/music-history/components/history-record-section.tsx",
  ),
  "utf8",
);
const sharedHelper = readFileSync(
  join(
    here,
    "../../../../../../packages/shared/src/utils/album-cover.ts",
  ),
  "utf8",
);

assert.match(sharedHelper, /export function isAlbumCoverGenerationReady/);
assert.match(sectionSource, /isAlbumCoverGenerationReady/);
assert.match(sectionSource, /generationStatus/);
assert.match(sectionSource, /hasReadyTracks/);
assert.match(sectionSource, /waitingForReady/);
assert.match(sectionSource, /isCoverRequestLocked/);
assert.match(sectionSource, /disabled=\{isGenerateBusy\}/);
assert.match(sectionSource, /handleGenerateCoverClick/);
assert.match(resultsSource, /generationStatus=\{status\.status\}/);
assert.match(resultsSource, /hasReadyTracks=\{playableTracks\.length > 0\}/);
assert.match(historySource, /generationStatus=\{item\.status\}/);
assert.match(historySource, /hasReadyTracks=/);

console.log("generation-album-cover-ready.contract.test.ts: ok");

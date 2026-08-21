/**
 * Unit tests for callback latency skip helpers (no DB/Redis).
 *   pnpm --filter @ai-music/api exec tsx src/modules/music/music-track-metadata.unit.test.ts
 */
import assert from "node:assert/strict";
import type { GeneratedTrack } from "@ai-music/ai-providers";
import {
  isTrackMetadataUnchanged,
  shouldSkipTrackOnDuplicateCallback,
} from "./music-track-metadata.js";

const baseExisting = {
  id: "t1",
  providerTrackId: "p1",
  title: "Song",
  durationSec: 10,
  audioSourceUrl: "https://example.test/a.mp3",
  imageSourceUrl: "https://example.test/a.jpg",
  lyricsText: "la",
  audioStorageKey: null as string | null,
  persistenceState: "pending",
};

const baseProvider: GeneratedTrack = {
  id: "p1",
  title: "Song",
  durationSec: 10,
  audioUrl: "https://example.test/a.mp3",
  imageUrl: "https://example.test/a.jpg",
  lyricsText: "la",
};

assert.equal(
  shouldSkipTrackOnDuplicateCallback("noop", baseExisting, baseProvider, baseProvider.audioUrl),
  true,
  "noop + pending + unchanged → skip",
);
assert.equal(
  shouldSkipTrackOnDuplicateCallback("conflict", baseExisting, baseProvider, baseProvider.audioUrl),
  true,
  "conflict + pending + unchanged → skip",
);
assert.equal(
  shouldSkipTrackOnDuplicateCallback("applied", baseExisting, baseProvider, baseProvider.audioUrl),
  false,
  "applied never skips",
);
assert.equal(
  shouldSkipTrackOnDuplicateCallback("noop", null, baseProvider, baseProvider.audioUrl),
  false,
  "new track never skips",
);
assert.equal(
  shouldSkipTrackOnDuplicateCallback(
    "noop",
    { ...baseExisting, persistenceState: "failed" },
    baseProvider,
    baseProvider.audioUrl,
  ),
  false,
  "failed is retryable — never skip",
);
assert.equal(
  shouldSkipTrackOnDuplicateCallback(
    "noop",
    baseExisting,
    { ...baseProvider, audioUrl: "https://example.test/b.mp3" },
    "https://example.test/b.mp3",
  ),
  false,
  "changed URL must not skip",
);
assert.equal(
  shouldSkipTrackOnDuplicateCallback(
    "noop",
    { ...baseExisting, persistenceState: "stored", audioStorageKey: "k" },
    baseProvider,
    baseProvider.audioUrl,
  ),
  true,
  "stored + unchanged → skip",
);
assert.equal(
  isTrackMetadataUnchanged(baseExisting, baseProvider, baseProvider.audioUrl),
  true,
);
assert.equal(
  isTrackMetadataUnchanged(baseExisting, { ...baseProvider, title: "Other" }, baseProvider.audioUrl),
  false,
);

console.log("music-track-metadata unit tests passed");

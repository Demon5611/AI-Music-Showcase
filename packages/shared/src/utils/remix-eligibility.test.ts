/**
 * Run: pnpm --filter @ai-music/shared exec tsx src/utils/remix-eligibility.test.ts
 */
import assert from "node:assert/strict";
import { resolveRemixEligibility } from "./remix-eligibility.js";

// A. generation=completed + playbackAvailable/stored → available
assert.deepEqual(
  resolveRemixEligibility({
    generationType: "song",
    audioStorageKey: "music-generations/u/g/t.mp3",
    persistenceState: "stored",
  }),
  { eligible: true, reason: "eligible" },
);

// B. partial_success parent label ignored; playable track → available
assert.equal(
  resolveRemixEligibility({
    generationType: "song",
    audioStorageKey: "music-generations/u/g/t.mp3",
    persistenceState: "stored",
    playbackAvailable: true,
  }).eligible,
  true,
);

// processing parent (live bug case) + stored track → available
assert.equal(
  resolveRemixEligibility({
    generationType: "song",
    audioStorageKey: "music-generations/u/g/cmslvwmnq000bks1dkl4dqmwz.mp3",
    persistenceState: "stored",
  }).eligible,
  true,
);

// C. completed label does not matter; processing audio → unavailable
assert.deepEqual(
  resolveRemixEligibility({
    generationType: "song",
    audioStorageKey: "music-generations/u/g/t.mp3",
    persistenceState: "processing",
  }),
  { eligible: false, reason: "audio_not_ready" },
);

// D. storage missing → unavailable
assert.deepEqual(
  resolveRemixEligibility({
    generationType: "song",
    audioStorageKey: null,
    persistenceState: "stored",
  }),
  { eligible: false, reason: "audio_not_ready" },
);
assert.deepEqual(
  resolveRemixEligibility({
    generationType: "song",
    audioStorageKey: "music-generations/u/g/t.mp3",
    persistenceState: "stored",
    persistenceErrorCode: "STORAGE_MISSING",
  }),
  { eligible: false, reason: "audio_not_ready" },
);

// non-song → unavailable
assert.deepEqual(
  resolveRemixEligibility({
    generationType: "lyrics",
    audioStorageKey: "music-generations/u/g/t.mp3",
    persistenceState: "stored",
  }),
  { eligible: false, reason: "not_song" },
);

// F. Mureka playable source is provider-neutral for eligibility
assert.equal(
  resolveRemixEligibility({
    generationType: "song",
    audioStorageKey: "music-generations/u/g/mureka.mp3",
    persistenceState: "stored",
  }).eligible,
  true,
);

// UI override: playbackAvailable false blocks
assert.equal(
  resolveRemixEligibility({
    playbackAvailable: false,
    audioStorageKey: "x",
    allowMissingStorageKey: true,
  }).eligible,
  false,
);

// Editor path: playable master without re-checking storage key shape
assert.equal(
  resolveRemixEligibility({
    generationType: "song",
    playbackAvailable: true,
    allowMissingStorageKey: true,
  }).eligible,
  true,
);

console.log("remix-eligibility.test.ts: ok");

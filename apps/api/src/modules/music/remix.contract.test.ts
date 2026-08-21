/**
 * AI Remix v1 stabilization: no silent persona / vocal_id; trust sourceTrackId only.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/remix.contract.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getSunoGenerationOptions,
  toPersistedSongInput,
} from "@ai-music/ai-providers";
import {
  musicRemixBodySchema,
  OPERATION_COST_UNITS,
  OPERATION_COST_CREDITS,
} from "@ai-music/shared";
import {
  buildRemixSongInput,
  remixSongInputHasPersona,
  remixSongInputHasVocalId,
} from "./build-remix-song-input.js";

const here = dirname(fileURLToPath(import.meta.url));
const remixService = readFileSync(join(here, "remix.service.ts"), "utf8");
const remixReference = readFileSync(join(here, "remix-reference-audio.ts"), "utf8");
const remixRoute = readFileSync(join(here, "routes.ts"), "utf8");
const editorPanel = readFileSync(
  join(here, "../../../../web/src/features/music-editor/editor-ai-remix-panel.tsx"),
  "utf8",
);

const sampleInput = buildRemixSongInput({
  prompt: "lyrics",
  styleTag: "pop",
  title: "Track — Pop remix",
  durationSec: 120,
  lyricsLanguage: "en",
  referenceAudioUrl: "https://provider.example/upload/remix.mp3",
});
const sunoOptions = getSunoGenerationOptions(sampleInput);
const persisted = toPersistedSongInput(sampleInput);

// A. Legacy Suno persona must not be injected into Remix input
assert.equal(remixService.includes("resolveMusicPersonaForUser"), false);
assert.equal(remixService.includes("buildPersonaSongInput"), false);
assert.equal(remixSongInputHasPersona(sampleInput), false);
assert.equal(sunoOptions?.personaId, undefined);
assert.equal(persisted.personaId, undefined);

// B. Ready Mureka VoiceProfile / vocal_id must not be passed
assert.equal(remixService.includes("vocalId"), false);
assert.equal(remixService.includes("vocal_id"), false);
assert.equal(remixSongInputHasVocalId(sampleInput), false);
assert.equal(persisted.vocalId, undefined);
assert.equal(sampleInput.providerOptions?.providerId, "sunoapi");

// C. My Voice toggle / music-create selection does not affect Editor Remix request
assert.equal(editorPanel.includes("usePersonalVoice"), false);
assert.equal(editorPanel.includes("hasPersonalMurekaVoice"), false);
assert.equal(remixService.includes("usePersonalVoice"), false);
assert.match(editorPanel, /api\.music\.remixTrack\(sourceTrackId/);

// D. Client arbitrary referenceAudioUrl rejected (strict body) / ignored by service
const rejected = musicRemixBodySchema.safeParse({
  styleId: "pop",
  referenceAudioUrl: "https://arbitrary-host.example/x.mp3",
});
assert.equal(rejected.success, false);
const accepted = musicRemixBodySchema.safeParse({ styleId: "pop" });
assert.equal(accepted.success, true);
assert.equal(remixService.includes("request.body.referenceAudioUrl"), false);
assert.equal(remixReference.includes("audioSourceUrl"), false);
assert.match(remixReference, /audioStorageKey/);
assert.match(remixReference, /getStorageService\(\)\.get/);

// E. Other user's track → Forbidden before spend
assert.match(remixService, /userId !== userId/);
assert.match(remixService, /ForbiddenError\("Track access denied"\)/);
const ownershipIdx = remixService.indexOf('ForbiddenError("Track access denied")');
const spendCallIdx = remixService.indexOf("await spendCredits(");
assert.ok(ownershipIdx >= 0 && spendCallIdx > ownershipIdx);

// F. Source audio unavailable → no spend (generation.status is not the gate)
assert.match(remixService, /assertRemixSourceEligible/);
assert.match(remixService, /resolveRemixEligibility/);
assert.equal(remixService.includes('status !== "completed"'), false);
assert.equal(
  remixService.includes("Ремикс доступен только для завершённых треков"),
  false,
);
assert.match(remixService, /Ремикс недоступен: исходное аудио не готово/);
const audioReadyIdx = remixService.indexOf("assertRemixSourceEligible");
assert.ok(audioReadyIdx >= 0 && spendCallIdx > audioReadyIdx);

// G. Valid path → Suno remix + 15 credits once
assert.match(remixService, /provider: "sunoapi"/);
assert.match(remixService, /OPERATION_COST_UNITS\.generateTrack/);
assert.equal(OPERATION_COST_CREDITS.generateTrack, 15);
assert.equal(OPERATION_COST_UNITS.generateTrack, 15_000);
assert.match(remixRoute, /\/api\/music\/tracks\/:trackId\/remix/);
assert.match(remixRoute, /musicRemixBodySchema/);
assert.match(remixRoute, /parsed\.data\.styleId/);
assert.equal(Boolean(sunoOptions?.referenceAudioUrl), true);
assert.equal(sunoOptions?.vocalGender, undefined);

// H. Original unchanged → separate MusicGeneration record
assert.match(remixService, /createMusicGenerationRecord/);
assert.equal(remixService.includes("prisma.musicGenerationTrack.update"), false);

// Logging must not include upload URL values in log payload
assert.match(remixService, /hasReferenceAudio: Boolean\(referenceAudioUrl\)/);
assert.equal(
  /log\?\.info\(\s*\{[\s\S]*?referenceAudioUrl\s*:/.test(remixService),
  false,
);

// No vocalGender requirement for Remix v1
assert.equal(remixService.includes("vocalGender"), false);

console.log("remix.contract.test.ts: ok");

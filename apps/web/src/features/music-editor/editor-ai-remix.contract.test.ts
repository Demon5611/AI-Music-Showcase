/**
 * AI Remix moved History → Music Editor.
 * Run: pnpm --filter @ai-music/shared exec tsx ../../apps/web/src/features/music-editor/editor-ai-remix.contract.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { OPERATION_COST_CREDITS } from "../../../../../packages/shared/src/constants/credits-economy.js";

const here = dirname(fileURLToPath(import.meta.url));
const messagesRoot = join(here, "../../../messages");

function isEditorRemixSourcePlayable(input: {
  sourceTrackId: string | null | undefined;
  masterAudioUrl: string | null | undefined;
}): boolean {
  return Boolean(input.sourceTrackId?.trim() && input.masterAudioUrl?.trim());
}

function resolveFirstPlayableRemixTrackId(
  tracks: Array<{
    id: string;
    audioUrl?: string | null;
    playbackAvailable?: boolean | null;
  }>,
): string | null {
  for (const track of tracks) {
    if (track.playbackAvailable && Boolean(track.audioUrl?.trim())) {
      return track.id;
    }
  }
  return null;
}

const historySection = readFileSync(
  join(here, "../music-history/components/history-record-section.tsx"),
  "utf8",
);
const audioEditor = readFileSync(join(here, "audio-editor.tsx"), "utf8");
const remixPanel = readFileSync(join(here, "editor-ai-remix-panel.tsx"), "utf8");
const eligibility = readFileSync(
  join(here, "utils/resolve-editor-remix-eligibility.ts"),
  "utf8",
);
const en = JSON.parse(readFileSync(join(messagesRoot, "en.json"), "utf8")) as {
  History: Record<string, unknown>;
  Editor: { remix: Record<string, string> };
};
const ru = JSON.parse(readFileSync(join(messagesRoot, "ru.json"), "utf8")) as {
  History: Record<string, unknown>;
  Editor: { remix: Record<string, string> };
};

// A. History has no AI Remix create controls
assert.equal(historySection.includes("TrackRemixPanel"), false);
assert.equal(historySection.includes("remixTrack"), false);
assert.equal(historySection.includes("EditorAiRemixPanel"), false);
assert.equal("remix" in en.History, false);
assert.equal("remix" in ru.History, false);

// B. History still exposes Open Editor
assert.match(historySection, /openEditor/);
assert.match(historySection, /onOpenEditor/);

// C–D. Editor hosts Remix; availability is reference-audio (master URL), not provider id
assert.match(audioEditor, /EditorAiRemixPanel/);
assert.equal(remixPanel.includes("sourceTrack.provider"), false);
assert.equal(remixPanel.includes("MUSIC_DEFAULT_PROVIDER"), false);
assert.equal(remixPanel.includes("usePersonalVoice"), false);
assert.equal(remixPanel.includes("Мой голос"), false);
assert.equal(remixPanel.includes("My Voice"), false);
assert.match(remixPanel, /OPERATION_COST_CREDITS\.generateTrack/);
assert.equal(/\b15\b/.test(remixPanel), false);
assert.equal(OPERATION_COST_CREDITS.generateTrack, 15);
assert.match(eligibility, /masterAudioUrl/);
assert.match(eligibility, /sourceTrackId/);
assert.match(eligibility, /resolveRemixEligibility/);
assert.equal(eligibility.includes('status !== "completed"'), false);
assert.equal(eligibility.includes("musicGeneration.status"), false);
assert.equal(eligibility.includes("Ремикс доступен только для завершённых"), false);

assert.equal(
  isEditorRemixSourcePlayable({
    sourceTrackId: "track-1",
    masterAudioUrl: "https://example.com/a.mp3",
  }),
  true,
);
assert.equal(
  isEditorRemixSourcePlayable({
    sourceTrackId: "track-1",
    masterAudioUrl: null,
  }),
  false,
);
assert.equal(
  isEditorRemixSourcePlayable({
    sourceTrackId: null,
    masterAudioUrl: "https://example.com/a.mp3",
  }),
  false,
);

// E–F. Mount / genre selection do not auto-call remix API
assert.equal(remixPanel.includes("void handleRemix()"), true);
assert.match(remixPanel, /onClick=\{\(\) => void handleRemix\(\)\}/);
assert.equal(remixPanel.includes("useEffect(() => {\n    void handleRemix"), false);

// G. Explicit click uses remixTrack once (submit lock)
assert.match(remixPanel, /submitLockRef/);
assert.match(remixPanel, /api\.music\.remixTrack\(sourceTrackId/);

// H–I. Success does not auto-replace current editor song
assert.equal(remixPanel.includes("hydrate("), false);
assert.match(remixPanel, /openRemix/);
assert.match(remixPanel, /goToHistory/);
assert.match(remixPanel, /initEditor\(remixTrackId\)/);

// J. Unplayable source: early return, no spend path without sourcePlayable
assert.match(remixPanel, /if \(!sourcePlayable \|\| !sourceTrackId/);
assert.match(remixPanel, /unavailableAudio/);

assert.equal(
  resolveFirstPlayableRemixTrackId([
    { id: "a", audioUrl: null, playbackAvailable: false },
    { id: "b", audioUrl: "https://x/b.mp3", playbackAvailable: true },
  ]),
  "b",
);

// K. i18n en/ru/ka parity
const enKeys = Object.keys(en.Editor.remix).sort();
const ruKeys = Object.keys(ru.Editor.remix).sort();
const ka = JSON.parse(
  readFileSync(new URL("../../../messages/ka.json", import.meta.url), "utf8"),
) as typeof en;
const kaKeys = Object.keys(ka.Editor.remix).sort();
assert.deepEqual(enKeys, ruKeys);
assert.deepEqual(enKeys, kaKeys);
assert.equal(ru.Editor.remix.unavailableAudio.includes("исходное аудио"), true);
assert.equal(en.Editor.remix.success, "Remix is ready");
assert.equal(ru.Editor.remix.success, "Ремикс готов");
assert.equal(typeof ka.Editor.remix.success, "string");
assert.notEqual(ka.Editor.remix.success, en.Editor.remix.success);

console.log("editor-ai-remix.contract.test.ts: ok");

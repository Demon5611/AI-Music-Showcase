/**
 * Run: pnpm --filter @ai-music/shared exec tsx ../../apps/web/src/features/landing/optional-personal-voice.contract.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveContinueWithoutVoiceCta } from "./resolve-continue-without-voice-cta.js";
import { resolveMusicCreateVoiceGate } from "../music-create/utils/resolve-music-create-voice-gate.js";
import { buildMusicGenerateBody } from "../music-create/utils/build-music-generate-body.js";

const here = dirname(fileURLToPath(import.meta.url));
const messagesRoot = join(here, "../../../messages");
const landingPage = readFileSync(join(here, "landing-page.tsx"), "utf8");
const landingClasses = readFileSync(join(here, "landing-classes.ts"), "utf8");
const voiceCreationPanel = readFileSync(
  join(here, "../voice/voice-creation-panel.tsx"),
  "utf8",
);
const musicCreatePanel = readFileSync(
  join(here, "../music-create/music-create-panel.tsx"),
  "utf8",
);
const en = JSON.parse(readFileSync(join(messagesRoot, "en.json"), "utf8")) as {
  Landing: {
    continueWithoutVoice: {
      or: string;
      lead: string;
      hint: string;
      label: string;
    };
  };
  MusicCreate: Record<string, string>;
  VoiceUpload: {
    creationTitle: string;
    creationOptionalLabel: string;
    creationHint: string;
  };
};
const ru = JSON.parse(readFileSync(join(messagesRoot, "ru.json"), "utf8")) as {
  Landing: {
    continueWithoutVoice: {
      or: string;
      lead: string;
      hint: string;
      label: string;
    };
  };
  MusicCreate: Record<string, string>;
  VoiceUpload: {
    creationTitle: string;
    creationOptionalLabel: string;
    creationHint: string;
  };
};

// A. no VoiceProfile → CTA visible/enabled
const ctaNoProfile = resolveContinueWithoutVoiceCta({});
assert.equal(ctaNoProfile.enabled, true);
assert.equal(ctaNoProfile.href, "/music-create");
assert.match(landingPage, /standardPathFork/);
assert.match(landingPage, /voicePathShell/);
assert.match(landingPage, /continueWithoutVoice\.label/);
assert.match(landingPage, /href=\{continueWithoutVoice\.href\}/);
assert.match(landingClasses, /standardPathFork/);
assert.match(landingClasses, /voicePathShell/);
assert.match(landingClasses, /standardPathButton/);

// B. VoiceProfile query error → CTA visible/enabled
assert.equal(
  resolveContinueWithoutVoiceCta({ voiceProfileQueryError: true }).enabled,
  true,
);

// C. consent unchecked → standard CTA enabled
assert.equal(
  resolveContinueWithoutVoiceCta({ consentUnchecked: true }).enabled,
  true,
);

// D. microphone denied → standard CTA enabled
assert.equal(
  resolveContinueWithoutVoiceCta({ microphoneDenied: true }).enabled,
  true,
);

// Failed sample / profile still do not block the fork CTA
assert.equal(
  resolveContinueWithoutVoiceCta({
    hasFailedVoiceSample: true,
    hasFailedVoiceProfile: true,
  }).enabled,
  true,
);

// E. click CTA → /music-create
assert.equal(resolveContinueWithoutVoiceCta().href, "/music-create");
assert.match(landingPage, /resolveContinueWithoutVoiceCta/);

// F. standard entry → usePersonalVoice=false, no voice IDs
const standardBody = buildMusicGenerateBody({
  prompt: "lyrics",
  style: "jazz",
  title: "T",
  durationSec: 30,
  voiceSampleId: null,
  voiceProfileId: null,
  usePersonalVoice: false,
});
assert.equal(standardBody.usePersonalVoice, false);
assert.equal(standardBody.voiceProfileId, undefined);
assert.equal(standardBody.voiceSampleId, undefined);
assert.equal(standardBody.providerOptions, undefined);
assert.equal(JSON.stringify(standardBody).includes("personaId"), false);
assert.equal(JSON.stringify(standardBody).includes("vocalId"), false);

assert.equal(
  resolveMusicCreateVoiceGate({
    usePersonalVoice: false,
    hasReadyPersonalVoice: false,
    personalVoiceQueryError: true,
  }).canGenerateWithSelectedVoice,
  true,
);
assert.match(musicCreatePanel, /resolveMusicCreateVoiceGate/);

// Voice section rename + optional badge (no duplicated "optional" in hint)
assert.equal(ru.VoiceUpload.creationTitle, "Создание собственного голоса");
assert.equal(en.VoiceUpload.creationTitle, "Create your own voice");
assert.equal(ru.VoiceUpload.creationOptionalLabel, "НЕОБЯЗАТЕЛЬНО");
assert.equal(en.VoiceUpload.creationOptionalLabel, "OPTIONAL");
assert.equal(
  ru.VoiceUpload.creationHint,
  "Запишите образец, если хотите использовать свой голос в будущих треках.",
);
assert.equal(
  en.VoiceUpload.creationHint,
  "Record a sample if you want to use your own voice in future tracks.",
);
assert.equal(ru.VoiceUpload.creationHint.toLowerCase().includes("необязательн"), false);
assert.equal(en.VoiceUpload.creationHint.toLowerCase().includes("optional"), false);
assert.match(voiceCreationPanel, /creationOptionalLabel/);
assert.match(voiceCreationPanel, /creationHint/);
assert.equal(voiceCreationPanel.includes("duration:"), false);

// Explicit fork copy
assert.equal(ru.Landing.continueWithoutVoice.or, "или");
assert.equal(en.Landing.continueWithoutVoice.or, "or");
assert.equal(
  ru.Landing.continueWithoutVoice.lead,
  "Не хотите записывать голос сейчас?",
);
assert.equal(
  en.Landing.continueWithoutVoice.lead,
  "Not ready to record your voice?",
);
assert.equal(
  ru.Landing.continueWithoutVoice.hint,
  "Создайте музыку со стандартным AI-вокалом.",
);
assert.equal(
  en.Landing.continueWithoutVoice.hint,
  "Create music with standard AI vocals instead.",
);
assert.equal(
  ru.Landing.continueWithoutVoice.label,
  "Создать трек с AI-вокалом",
);
assert.equal(
  en.Landing.continueWithoutVoice.label,
  "Create a track with AI vocals",
);
assert.match(landingPage, /continueWithoutVoice\.or/);
assert.match(landingPage, /continueWithoutVoice\.lead/);

// G. RU/EN parity
assert.deepEqual(
  Object.keys(en.Landing.continueWithoutVoice).sort(),
  Object.keys(ru.Landing.continueWithoutVoice).sort(),
);
assert.deepEqual(
  ["creationTitle", "creationOptionalLabel", "creationHint"].every(
    (key) => key in en.VoiceUpload && key in ru.VoiceUpload,
  ),
  true,
);

console.log("optional-personal-voice.contract.test.ts: ok");

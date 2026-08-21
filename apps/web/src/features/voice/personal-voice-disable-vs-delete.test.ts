/**
 * Documents Disable ≠ Delete for personal Mureka voice.
 * Disable is client generate-time only; Delete is Profile + request-deletion API.
 */
import assert from "node:assert/strict";
import { buildMusicGenerateBody } from "../music-create/utils/build-music-generate-body.js";

function run() {
  const readyProfileId = "vp-ready-same";
  const externalIdWouldBe = "vocal-abc";

  // Disable: Suno path; profile lifecycle untouched.
  const disabled = buildMusicGenerateBody({
    prompt: "lyrics",
    style: "pop",
    title: "Song",
    durationSec: 60,
    voiceSampleId: null,
    voiceProfileId: readyProfileId,
    usePersonalVoice: false,
  });

  assert.equal(disabled.usePersonalVoice, false);
  assert.equal(disabled.voiceProfileId, undefined);
  assert.equal(disabled.providerOptions, undefined);
  assert.equal(disabled.customMode, true);

  // Enable again: same ready profile id — no new Vocal Clone.
  const enabled = buildMusicGenerateBody({
    prompt: "lyrics",
    style: "pop",
    title: "Song",
    durationSec: 60,
    voiceSampleId: null,
    voiceProfileId: readyProfileId,
    usePersonalVoice: true,
  });
  assert.equal(enabled.voiceProfileId, readyProfileId);
  assert.equal(enabled.usePersonalVoice, true);
  assert.equal(enabled.providerOptions?.providerId, "mureka");

  // OFF → ON: same profileId, no clone payload, no create-voice spend signal.
  const reEnabled = buildMusicGenerateBody({
    prompt: "lyrics",
    style: "pop",
    title: "Song",
    durationSec: 60,
    voiceSampleId: null,
    voiceProfileId: readyProfileId,
    usePersonalVoice: true,
  });
  assert.equal(reEnabled.voiceProfileId, readyProfileId);
  assert.equal(reEnabled.voiceSampleId, undefined);
  assert.equal(reEnabled.usePersonalVoice, true);
  assert.equal("createPersonalVoice" in reEnabled, false);
  assert.equal(JSON.stringify(reEnabled).includes("1200"), false);
  assert.equal(enabled.voiceProfileId, reEnabled.voiceProfileId);

  assert.equal("deletion" in disabled, false);
  assert.notEqual(externalIdWouldBe, disabled.voiceProfileId);

  console.log("personal-voice-disable-vs-delete unit tests passed");
}

run();

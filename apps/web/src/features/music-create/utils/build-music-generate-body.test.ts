import assert from "node:assert/strict";
import { buildMusicGenerateBody } from "./build-music-generate-body";

function run() {
  const murekaBody = buildMusicGenerateBody({
    prompt: "lyrics here",
    style: "pop, upbeat",
    title: "Song",
    durationSec: 60,
    voiceSampleId: "vs-legacy",
    voiceProfileId: "vp-ready",
    usePersonalVoice: true,
    lyricsLanguage: "ru",
  });

  assert.equal(murekaBody.voiceProfileId, "vp-ready");
  assert.equal(murekaBody.usePersonalVoice, true);
  assert.equal(murekaBody.providerOptions?.providerId, "mureka");
  assert.equal(
    murekaBody.providerOptions?.providerId === "mureka"
      ? murekaBody.providerOptions.options?.voiceProfileId
      : undefined,
    "vp-ready",
  );
  assert.equal(murekaBody.musicBrief?.additionalInstructions, "pop, upbeat");
  assert.equal(murekaBody.customMode, undefined);
  assert.equal(murekaBody.instrumental, undefined);
  assert.equal(murekaBody.vocalGender, undefined);
  assert.equal(murekaBody.referenceAudioUrl, undefined);
  assert.equal(murekaBody.voiceSampleId, undefined);

  // Ready profile + OFF → SunoAPI (never Mureka without personal voice).
  const offWithReadyProfile = buildMusicGenerateBody({
    prompt: "lyrics",
    style: "dreamy pop",
    title: "Off",
    durationSec: 60,
    voiceSampleId: "vs1",
    voiceProfileId: "vp-ready",
    usePersonalVoice: false,
    lyricsLanguage: "ru",
  });
  assert.equal(offWithReadyProfile.usePersonalVoice, false);
  assert.equal(offWithReadyProfile.voiceProfileId, undefined);
  assert.equal(offWithReadyProfile.voiceSampleId, undefined);
  assert.equal(offWithReadyProfile.providerOptions, undefined);
  assert.equal(offWithReadyProfile.customMode, true);
  assert.equal(offWithReadyProfile.instrumental, false);

  // No profile → SunoAPI.
  const noProfile = buildMusicGenerateBody({
    prompt: "lyrics",
    style: "jazz",
    title: "T",
    durationSec: 30,
    voiceSampleId: null,
    voiceProfileId: null,
    usePersonalVoice: false,
  });
  assert.equal(noProfile.usePersonalVoice, false);
  assert.equal(noProfile.providerOptions, undefined);
  assert.equal(noProfile.customMode, true);

  console.log("build-music-generate-body tests passed");
}

run();

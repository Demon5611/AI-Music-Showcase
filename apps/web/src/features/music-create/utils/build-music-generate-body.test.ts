import assert from "node:assert/strict";
import { buildMusicGenerateBody } from "./build-music-generate-body";

function run() {
  const audioengineBody = buildMusicGenerateBody({
    prompt: "lyrics here",
    style: "pop, upbeat",
    title: "Song",
    durationSec: 60,
    voiceSampleId: "vs-legacy",
    voiceProfileId: "vp-ready",
    usePersonalVoice: true,
    lyricsLanguage: "ru",
  });

  assert.equal(audioengineBody.voiceProfileId, "vp-ready");
  assert.equal(audioengineBody.usePersonalVoice, true);
  assert.equal(audioengineBody.providerOptions?.providerId, "audioengine");
  assert.equal(
    audioengineBody.providerOptions?.providerId === "audioengine"
      ? audioengineBody.providerOptions.options?.voiceProfileId
      : undefined,
    "vp-ready",
  );
  assert.equal(audioengineBody.musicBrief?.additionalInstructions, "pop, upbeat");
  assert.equal(audioengineBody.customMode, undefined);
  assert.equal(audioengineBody.instrumental, undefined);
  assert.equal(audioengineBody.vocalGender, undefined);
  assert.equal(audioengineBody.referenceAudioUrl, undefined);
  assert.equal(audioengineBody.voiceSampleId, undefined);

  // Ready profile + OFF → LegacyengineAPI (never Audioengine without personal voice).
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

  // No profile → LegacyengineAPI.
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

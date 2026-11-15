/**
 * Final music provider routing + cover invariants.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/music-provider-routing.contract.test.ts
 */
import assert from "node:assert/strict";
import { resolveMusicProviderForGeneration } from "@ai-music/ai-providers";
import {
  AUDIOENGINE_CREDIT_COST_UNITS,
  OPERATION_COST_UNITS,
  musicGenerateBodySchema,
  resolveMusicGenerateCostUnits,
} from "@ai-music/shared";
import { resolveAlbumCoverStrategy } from "./album-cover-strategy.js";
import { normalizeMusicGenerateBody } from "./music-generate-body.js";
import { resolveTimedLyricsStrategy } from "./timed-lyrics-strategy.js";

const stagingEnv = {
  AUDIOENGINE_ENABLED: "true",
  AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
  MUSIC_DEFAULT_PROVIDER: "audioengine",
};

function assertReadyProfileOffIsLegacyengine(): void {
  const routed = resolveMusicProviderForGeneration({
    hasPersonalAudioengineVoice: false,
    explicitProvider: "audioengine",
    env: stagingEnv,
  });
  assert.equal("providerId" in routed && routed.providerId, "legacyengineapi");

  const body = normalizeMusicGenerateBody(
    musicGenerateBodySchema.parse({
      prompt: "lyrics",
      customMode: true,
      instrumental: false,
      voiceProfileId: "vp-ready",
      usePersonalVoice: false,
      providerOptions: { providerId: "audioengine", options: {} },
    }),
  );
  assert.equal(body.usePersonalVoice, false);
  assert.equal(body.voiceProfileId, undefined);
  assert.equal(body.input.providerOptions?.providerId, "legacyengineapi");
  assert.equal(
    resolveMusicGenerateCostUnits({ usePersonalVoice: false }),
    OPERATION_COST_UNITS.generateTrack,
  );
  assert.equal(OPERATION_COST_UNITS.generateTrack, 15_000);
}

function assertReadyProfileOnIsAudioengine(): void {
  const routed = resolveMusicProviderForGeneration({
    hasPersonalAudioengineVoice: true,
    env: stagingEnv,
  });
  assert.equal("providerId" in routed && routed.providerId, "audioengine");

  const body = normalizeMusicGenerateBody(
    musicGenerateBodySchema.parse({
      prompt: "lyrics",
      voiceProfileId: "vp-ready",
      usePersonalVoice: true,
      providerOptions: {
        providerId: "audioengine",
        options: { voiceProfileId: "vp-ready" },
      },
    }),
  );
  assert.equal(body.usePersonalVoice, true);
  assert.equal(body.voiceProfileId, "vp-ready");
  assert.equal(body.input.providerOptions?.providerId, "audioengine");
  assert.equal(
    resolveMusicGenerateCostUnits({ usePersonalVoice: true }),
    AUDIOENGINE_CREDIT_COST_UNITS.generateSongs,
  );
  assert.equal(AUDIOENGINE_CREDIT_COST_UNITS.generateSongs, 24_000);
}

function assertNoProfileIsLegacyengine(): void {
  const routed = resolveMusicProviderForGeneration({
    hasPersonalAudioengineVoice: false,
    env: stagingEnv,
  });
  assert.equal("providerId" in routed && routed.providerId, "legacyengineapi");
}

function assertCoverNeverMixesTaskIds(): void {
  const audioengine = resolveAlbumCoverStrategy({
    musicProvider: "audioengine",
    providerTaskId: "audioengine-task-1",
  });
  assert.equal(audioengine.kind, "unavailable");
  assert.equal("legacyengineMusicTaskId" in audioengine, false);

  const legacyengine = resolveAlbumCoverStrategy({
    musicProvider: "legacyengineapi",
    providerTaskId: "legacyengine-task-1",
  });
  assert.equal(legacyengine.kind, "legacyengine_music_task");
  if (legacyengine.kind === "legacyengine_music_task") {
    assert.equal(legacyengine.legacyengineMusicTaskId, "legacyengine-task-1");
  }
}

function assertTimedLyricsUsesTrackProviderNotDefault(): void {
  const legacyengineUnderAudioengineDefault = resolveTimedLyricsStrategy({
    musicProvider: "legacyengineapi",
    providerTaskId: "legacyengine-task-1",
    providerAudioId: "legacyengine-audio-1",
  });
  assert.equal(legacyengineUnderAudioengineDefault.kind, "legacyengine_timestamped");

  const audioengineTrack = resolveTimedLyricsStrategy({
    musicProvider: "audioengine",
    providerTaskId: "audioengine-task-1",
    providerAudioId: "audioengine-choice-1",
  });
  assert.equal(audioengineTrack.kind, "unavailable");
  assert.equal("legacyengineTaskId" in audioengineTrack, false);
}

assertReadyProfileOffIsLegacyengine();
assertReadyProfileOnIsAudioengine();
assertNoProfileIsLegacyengine();
assertCoverNeverMixesTaskIds();
assertTimedLyricsUsesTrackProviderNotDefault();
console.log("music-provider-routing.contract.test.ts: ok");

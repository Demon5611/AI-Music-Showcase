/**
 * Final music provider routing + cover invariants.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/music-provider-routing.contract.test.ts
 */
import assert from "node:assert/strict";
import { resolveMusicProviderForGeneration } from "@ai-music/ai-providers";
import {
  MUREKA_CREDIT_COST_UNITS,
  OPERATION_COST_UNITS,
  musicGenerateBodySchema,
  resolveMusicGenerateCostUnits,
} from "@ai-music/shared";
import { resolveAlbumCoverStrategy } from "./album-cover-strategy.js";
import { normalizeMusicGenerateBody } from "./music-generate-body.js";
import { resolveTimedLyricsStrategy } from "./timed-lyrics-strategy.js";

const stagingEnv = {
  MUREKA_ENABLED: "true",
  MUREKA_PERSONAL_VOICE_ENABLED: "true",
  MUSIC_DEFAULT_PROVIDER: "mureka",
};

function assertReadyProfileOffIsSuno(): void {
  const routed = resolveMusicProviderForGeneration({
    hasPersonalMurekaVoice: false,
    explicitProvider: "mureka",
    env: stagingEnv,
  });
  assert.equal("providerId" in routed && routed.providerId, "sunoapi");

  const body = normalizeMusicGenerateBody(
    musicGenerateBodySchema.parse({
      prompt: "lyrics",
      customMode: true,
      instrumental: false,
      voiceProfileId: "vp-ready",
      usePersonalVoice: false,
      providerOptions: { providerId: "mureka", options: {} },
    }),
  );
  assert.equal(body.usePersonalVoice, false);
  assert.equal(body.voiceProfileId, undefined);
  assert.equal(body.input.providerOptions?.providerId, "sunoapi");
  assert.equal(
    resolveMusicGenerateCostUnits({ usePersonalVoice: false }),
    OPERATION_COST_UNITS.generateTrack,
  );
  assert.equal(OPERATION_COST_UNITS.generateTrack, 15_000);
}

function assertReadyProfileOnIsMureka(): void {
  const routed = resolveMusicProviderForGeneration({
    hasPersonalMurekaVoice: true,
    env: stagingEnv,
  });
  assert.equal("providerId" in routed && routed.providerId, "mureka");

  const body = normalizeMusicGenerateBody(
    musicGenerateBodySchema.parse({
      prompt: "lyrics",
      voiceProfileId: "vp-ready",
      usePersonalVoice: true,
      providerOptions: {
        providerId: "mureka",
        options: { voiceProfileId: "vp-ready" },
      },
    }),
  );
  assert.equal(body.usePersonalVoice, true);
  assert.equal(body.voiceProfileId, "vp-ready");
  assert.equal(body.input.providerOptions?.providerId, "mureka");
  assert.equal(
    resolveMusicGenerateCostUnits({ usePersonalVoice: true }),
    MUREKA_CREDIT_COST_UNITS.generateSongs,
  );
  assert.equal(MUREKA_CREDIT_COST_UNITS.generateSongs, 24_000);
}

function assertNoProfileIsSuno(): void {
  const routed = resolveMusicProviderForGeneration({
    hasPersonalMurekaVoice: false,
    env: stagingEnv,
  });
  assert.equal("providerId" in routed && routed.providerId, "sunoapi");
}

function assertCoverNeverMixesTaskIds(): void {
  const mureka = resolveAlbumCoverStrategy({
    musicProvider: "mureka",
    providerTaskId: "mureka-task-1",
  });
  assert.equal(mureka.kind, "unavailable");
  assert.equal("sunoMusicTaskId" in mureka, false);

  const suno = resolveAlbumCoverStrategy({
    musicProvider: "sunoapi",
    providerTaskId: "suno-task-1",
  });
  assert.equal(suno.kind, "suno_music_task");
  if (suno.kind === "suno_music_task") {
    assert.equal(suno.sunoMusicTaskId, "suno-task-1");
  }
}

function assertTimedLyricsUsesTrackProviderNotDefault(): void {
  const sunoUnderMurekaDefault = resolveTimedLyricsStrategy({
    musicProvider: "sunoapi",
    providerTaskId: "suno-task-1",
    providerAudioId: "suno-audio-1",
  });
  assert.equal(sunoUnderMurekaDefault.kind, "suno_timestamped");

  const murekaTrack = resolveTimedLyricsStrategy({
    musicProvider: "mureka",
    providerTaskId: "mureka-task-1",
    providerAudioId: "mureka-choice-1",
  });
  assert.equal(murekaTrack.kind, "unavailable");
  assert.equal("sunoTaskId" in murekaTrack, false);
}

assertReadyProfileOffIsSuno();
assertReadyProfileOnIsMureka();
assertNoProfileIsSuno();
assertCoverNeverMixesTaskIds();
assertTimedLyricsUsesTrackProviderNotDefault();
console.log("music-provider-routing.contract.test.ts: ok");

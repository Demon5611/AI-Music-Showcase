/**
 * Staging bugfixes: auto lyricsLanguage + OFF without persona.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/music-generate-routing-fixes.contract.test.ts
 */
import assert from "node:assert/strict";
import { resolveMusicProviderForGeneration } from "@ai-music/ai-providers";
import {
  AUDIOENGINE_CREDIT_COST_UNITS,
  OPERATION_COST_UNITS,
  musicGenerateBodySchema,
  normalizeLyricsLanguage,
  resolveLyricsLanguage,
  resolveMusicGenerateCostUnits,
} from "@ai-music/shared";
import { resolveAlbumCoverStrategy } from "./album-cover-strategy.js";
import { normalizeMusicGenerateBody } from "./music-generate-body.js";

const stagingEnv = {
  AUDIOENGINE_ENABLED: "true",
  AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
  MUSIC_DEFAULT_PROVIDER: "legacyengineapi",
};

function resolveForRouting(selected: string, prompt: string): string {
  const requested = normalizeLyricsLanguage(selected);
  return resolveLyricsLanguage({
    selectedLanguage: requested,
    prompt,
    customLyrics: prompt,
  }).code;
}

function testAutoRuPersonalVoice(): void {
  const resolved = resolveForRouting("auto", "Привет мир, это русский текст песни");
  assert.equal(resolved, "ru");
  assert.notEqual(resolved, "auto");

  const routed = resolveMusicProviderForGeneration({
    hasPersonalAudioengineVoice: true,
    lyricsLanguage: resolved,
    env: stagingEnv,
  });
  assert.equal("providerId" in routed && routed.providerId, "audioengine");
}

function testAutoEnPersonalVoice(): void {
  const resolved = resolveForRouting(
    "auto",
    "Hello world this is an english song lyric about summer friends",
  );
  assert.equal(resolved, "en");

  const routed = resolveMusicProviderForGeneration({
    hasPersonalAudioengineVoice: true,
    lyricsLanguage: resolved,
    env: stagingEnv,
  });
  assert.equal("providerId" in routed && routed.providerId, "audioengine");
}

function testExplicitRuUnchanged(): void {
  assert.equal(resolveForRouting("ru", "anything"), "ru");
}

function testLiteralAutoRejectedByProviderRouter(): void {
  const routed = resolveMusicProviderForGeneration({
    hasPersonalAudioengineVoice: true,
    lyricsLanguage: "auto",
    env: stagingEnv,
  });
  assert.equal("error" in routed, true);
  if ("error" in routed) {
    assert.equal(routed.error.code, "AUDIOENGINE_LANGUAGE_UNSUPPORTED");
  }
}

function testUnsupportedResolvedLanguage(): void {
  const routed = resolveMusicProviderForGeneration({
    hasPersonalAudioengineVoice: true,
    lyricsLanguage: "ka",
    env: stagingEnv,
  });
  assert.equal("error" in routed, true);
  if ("error" in routed) {
    assert.equal(routed.error.code, "AUDIOENGINE_LANGUAGE_UNSUPPORTED");
  }
}

function testOffNormalizeIsLegacyengineNoVoiceGates(): void {
  const normalized = normalizeMusicGenerateBody(
    musicGenerateBodySchema.parse({
      prompt: "lyrics",
      style: "pop",
      title: "T",
      customMode: true,
      instrumental: false,
      usePersonalVoice: false,
      voiceProfileId: "vp-ready-ignored",
      lyricsLanguage: "auto",
    }),
  );
  assert.equal(normalized.usePersonalVoice, false);
  assert.equal(normalized.voiceProfileId, undefined);
  assert.equal(normalized.voiceSampleId, undefined);
  assert.equal(normalized.input.providerOptions?.providerId, "legacyengineapi");
  assert.equal(
    resolveMusicGenerateCostUnits({ usePersonalVoice: false }),
    OPERATION_COST_UNITS.generateTrack,
  );
  assert.equal(OPERATION_COST_UNITS.generateTrack, 15_000);
}

function testOnNormalizeIsAudioengine(): void {
  const normalized = normalizeMusicGenerateBody(
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
  assert.equal(normalized.usePersonalVoice, true);
  assert.equal(normalized.voiceProfileId, "vp-ready");
  assert.equal(normalized.input.providerOptions?.providerId, "audioengine");
  assert.equal(
    resolveMusicGenerateCostUnits({ usePersonalVoice: true }),
    AUDIOENGINE_CREDIT_COST_UNITS.generateSongs,
  );
  assert.equal(AUDIOENGINE_CREDIT_COST_UNITS.generateSongs, 24_000);
}

function testOffOnOffProviders(): void {
  const off = resolveMusicProviderForGeneration({
    hasPersonalAudioengineVoice: false,
    env: stagingEnv,
  });
  const on = resolveMusicProviderForGeneration({
    hasPersonalAudioengineVoice: true,
    lyricsLanguage: "ru",
    env: stagingEnv,
  });
  const offAgain = resolveMusicProviderForGeneration({
    hasPersonalAudioengineVoice: false,
    env: stagingEnv,
  });
  assert.equal("providerId" in off && off.providerId, "legacyengineapi");
  assert.equal("providerId" in on && on.providerId, "audioengine");
  assert.equal("providerId" in offAgain && offAgain.providerId, "legacyengineapi");
}

function testCoverNeverMixes(): void {
  const audioengine = resolveAlbumCoverStrategy({
    musicProvider: "audioengine",
    providerTaskId: "154182084722690",
  });
  assert.equal(audioengine.kind, "unavailable");
  assert.equal("legacyengineMusicTaskId" in audioengine, false);
}

testAutoRuPersonalVoice();
testAutoEnPersonalVoice();
testExplicitRuUnchanged();
testLiteralAutoRejectedByProviderRouter();
testUnsupportedResolvedLanguage();
testOffNormalizeIsLegacyengineNoVoiceGates();
testOnNormalizeIsAudioengine();
testOffOnOffProviders();
testCoverNeverMixes();
console.log("music-generate-routing-fixes.contract.test.ts: ok");

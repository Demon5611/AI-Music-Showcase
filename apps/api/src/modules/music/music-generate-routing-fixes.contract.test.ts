/**
 * Staging bugfixes: auto lyricsLanguage + OFF without persona.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/music-generate-routing-fixes.contract.test.ts
 */
import assert from "node:assert/strict";
import { resolveMusicProviderForGeneration } from "@ai-music/ai-providers";
import {
  MUREKA_CREDIT_COST_UNITS,
  OPERATION_COST_UNITS,
  musicGenerateBodySchema,
  normalizeLyricsLanguage,
  resolveLyricsLanguage,
  resolveMusicGenerateCostUnits,
} from "@ai-music/shared";
import { resolveAlbumCoverStrategy } from "./album-cover-strategy.js";
import { normalizeMusicGenerateBody } from "./music-generate-body.js";

const stagingEnv = {
  MUREKA_ENABLED: "true",
  MUREKA_PERSONAL_VOICE_ENABLED: "true",
  MUSIC_DEFAULT_PROVIDER: "sunoapi",
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
    hasPersonalMurekaVoice: true,
    lyricsLanguage: resolved,
    env: stagingEnv,
  });
  assert.equal("providerId" in routed && routed.providerId, "mureka");
}

function testAutoEnPersonalVoice(): void {
  const resolved = resolveForRouting(
    "auto",
    "Hello world this is an english song lyric about summer friends",
  );
  assert.equal(resolved, "en");

  const routed = resolveMusicProviderForGeneration({
    hasPersonalMurekaVoice: true,
    lyricsLanguage: resolved,
    env: stagingEnv,
  });
  assert.equal("providerId" in routed && routed.providerId, "mureka");
}

function testExplicitRuUnchanged(): void {
  assert.equal(resolveForRouting("ru", "anything"), "ru");
}

function testLiteralAutoRejectedByProviderRouter(): void {
  const routed = resolveMusicProviderForGeneration({
    hasPersonalMurekaVoice: true,
    lyricsLanguage: "auto",
    env: stagingEnv,
  });
  assert.equal("error" in routed, true);
  if ("error" in routed) {
    assert.equal(routed.error.code, "MUREKA_LANGUAGE_UNSUPPORTED");
  }
}

function testUnsupportedResolvedLanguage(): void {
  const routed = resolveMusicProviderForGeneration({
    hasPersonalMurekaVoice: true,
    lyricsLanguage: "ka",
    env: stagingEnv,
  });
  assert.equal("error" in routed, true);
  if ("error" in routed) {
    assert.equal(routed.error.code, "MUREKA_LANGUAGE_UNSUPPORTED");
  }
}

function testOffNormalizeIsSunoNoVoiceGates(): void {
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
  assert.equal(normalized.input.providerOptions?.providerId, "sunoapi");
  assert.equal(
    resolveMusicGenerateCostUnits({ usePersonalVoice: false }),
    OPERATION_COST_UNITS.generateTrack,
  );
  assert.equal(OPERATION_COST_UNITS.generateTrack, 15_000);
}

function testOnNormalizeIsMureka(): void {
  const normalized = normalizeMusicGenerateBody(
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
  assert.equal(normalized.usePersonalVoice, true);
  assert.equal(normalized.voiceProfileId, "vp-ready");
  assert.equal(normalized.input.providerOptions?.providerId, "mureka");
  assert.equal(
    resolveMusicGenerateCostUnits({ usePersonalVoice: true }),
    MUREKA_CREDIT_COST_UNITS.generateSongs,
  );
  assert.equal(MUREKA_CREDIT_COST_UNITS.generateSongs, 24_000);
}

function testOffOnOffProviders(): void {
  const off = resolveMusicProviderForGeneration({
    hasPersonalMurekaVoice: false,
    env: stagingEnv,
  });
  const on = resolveMusicProviderForGeneration({
    hasPersonalMurekaVoice: true,
    lyricsLanguage: "ru",
    env: stagingEnv,
  });
  const offAgain = resolveMusicProviderForGeneration({
    hasPersonalMurekaVoice: false,
    env: stagingEnv,
  });
  assert.equal("providerId" in off && off.providerId, "sunoapi");
  assert.equal("providerId" in on && on.providerId, "mureka");
  assert.equal("providerId" in offAgain && offAgain.providerId, "sunoapi");
}

function testCoverNeverMixes(): void {
  const mureka = resolveAlbumCoverStrategy({
    musicProvider: "mureka",
    providerTaskId: "154182084722690",
  });
  assert.equal(mureka.kind, "unavailable");
  assert.equal("sunoMusicTaskId" in mureka, false);
}

testAutoRuPersonalVoice();
testAutoEnPersonalVoice();
testExplicitRuUnchanged();
testLiteralAutoRejectedByProviderRouter();
testUnsupportedResolvedLanguage();
testOffNormalizeIsSunoNoVoiceGates();
testOnNormalizeIsMureka();
testOffOnOffProviders();
testCoverNeverMixes();
console.log("music-generate-routing-fixes.contract.test.ts: ok");

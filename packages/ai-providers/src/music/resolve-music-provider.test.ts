import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMusicProviderForGeneration } from "./resolve-music-provider.js";

describe("resolveMusicProviderForGeneration", () => {
  it("routes personal voice to audioengine when enabled", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalAudioengineVoice: true,
      lyricsLanguage: "ru",
      env: {
        AUDIOENGINE_ENABLED: "true",
        AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
        MUSIC_DEFAULT_PROVIDER: "legacyengineapi",
      },
    });
    assert.equal("providerId" in result && result.providerId, "audioengine");
  });

  it("does not silently fall back personal voice to legacyengine", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalAudioengineVoice: true,
      lyricsLanguage: "ru",
      env: {
        AUDIOENGINE_ENABLED: "false",
        MUSIC_DEFAULT_PROVIDER: "legacyengineapi",
        LEGACYENGINE_FALLBACK_ENABLED: "true",
      },
    });
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "AUDIOENGINE_PERSONAL_VOICE_UNAVAILABLE");
    }
  });

  it("rejects unsupported language for audioengine personal voice", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalAudioengineVoice: true,
      lyricsLanguage: "hi",
      env: {
        AUDIOENGINE_ENABLED: "true",
        AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
      },
    });
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "AUDIOENGINE_LANGUAGE_UNSUPPORTED");
    }
  });

  it("ready profile alone does not select audioengine (OFF → legacyengineapi)", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalAudioengineVoice: false,
      explicitProvider: "audioengine",
      lyricsLanguage: "en",
      env: {
        AUDIOENGINE_ENABLED: "true",
        AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
        MUSIC_DEFAULT_PROVIDER: "audioengine",
      },
    });
    assert.equal("providerId" in result && result.providerId, "legacyengineapi");
  });

  it("rejects literal auto before resolution", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalAudioengineVoice: true,
      lyricsLanguage: "auto",
      env: {
        AUDIOENGINE_ENABLED: "true",
        AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
      },
    });
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "AUDIOENGINE_LANGUAGE_UNSUPPORTED");
    }
  });

  it("no personal voice always uses legacyengineapi even when default is audioengine", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalAudioengineVoice: false,
      lyricsLanguage: "en",
      env: {
        AUDIOENGINE_ENABLED: "true",
        MUSIC_DEFAULT_PROVIDER: "audioengine",
      },
    });
    assert.equal("providerId" in result && result.providerId, "legacyengineapi");
  });

  it("production without rollout rejects personal voice (no Legacyengine fallback)", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalAudioengineVoice: true,
      lyricsLanguage: "en",
      appEnv: "production",
      env: {
        AUDIOENGINE_ENABLED: "true",
        AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
        AUDIOENGINE_API_KEY: "key",
        AUDIOENGINE_BASE_URL: "https://integration.example.invalid",
        AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED: "false",
        MUSIC_DEFAULT_PROVIDER: "audioengine",
      },
    });
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "AUDIOENGINE_PERSONAL_VOICE_UNAVAILABLE");
    }
  });

  it("production with rollout routes personal voice to audioengine", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalAudioengineVoice: true,
      lyricsLanguage: "en",
      appEnv: "production",
      env: {
        AUDIOENGINE_ENABLED: "true",
        AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
        AUDIOENGINE_API_KEY: "key",
        AUDIOENGINE_BASE_URL: "https://integration.example.invalid",
        AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED: "true",
        MUSIC_DEFAULT_PROVIDER: "legacyengineapi",
      },
    });
    assert.equal("providerId" in result && result.providerId, "audioengine");
  });

  it("production My Voice OFF stays legacyengineapi regardless of rollout", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalAudioengineVoice: false,
      lyricsLanguage: "en",
      appEnv: "production",
      env: {
        AUDIOENGINE_ENABLED: "true",
        AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
        AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED: "true",
        MUSIC_DEFAULT_PROVIDER: "audioengine",
      },
    });
    assert.equal("providerId" in result && result.providerId, "legacyengineapi");
  });
});

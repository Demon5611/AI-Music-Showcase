import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMusicProviderForGeneration } from "./resolve-music-provider.js";

describe("resolveMusicProviderForGeneration", () => {
  it("routes personal voice to mureka when enabled", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalMurekaVoice: true,
      lyricsLanguage: "ru",
      env: {
        MUREKA_ENABLED: "true",
        MUREKA_PERSONAL_VOICE_ENABLED: "true",
        MUSIC_DEFAULT_PROVIDER: "sunoapi",
      },
    });
    assert.equal("providerId" in result && result.providerId, "mureka");
  });

  it("does not silently fall back personal voice to suno", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalMurekaVoice: true,
      lyricsLanguage: "ru",
      env: {
        MUREKA_ENABLED: "false",
        MUSIC_DEFAULT_PROVIDER: "sunoapi",
        SUNO_FALLBACK_ENABLED: "true",
      },
    });
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "MUREKA_PERSONAL_VOICE_UNAVAILABLE");
    }
  });

  it("rejects unsupported language for mureka personal voice", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalMurekaVoice: true,
      lyricsLanguage: "hi",
      env: {
        MUREKA_ENABLED: "true",
        MUREKA_PERSONAL_VOICE_ENABLED: "true",
      },
    });
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "MUREKA_LANGUAGE_UNSUPPORTED");
    }
  });

  it("ready profile alone does not select mureka (OFF → sunoapi)", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalMurekaVoice: false,
      explicitProvider: "mureka",
      lyricsLanguage: "en",
      env: {
        MUREKA_ENABLED: "true",
        MUREKA_PERSONAL_VOICE_ENABLED: "true",
        MUSIC_DEFAULT_PROVIDER: "mureka",
      },
    });
    assert.equal("providerId" in result && result.providerId, "sunoapi");
  });

  it("rejects literal auto before resolution", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalMurekaVoice: true,
      lyricsLanguage: "auto",
      env: {
        MUREKA_ENABLED: "true",
        MUREKA_PERSONAL_VOICE_ENABLED: "true",
      },
    });
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "MUREKA_LANGUAGE_UNSUPPORTED");
    }
  });

  it("no personal voice always uses sunoapi even when default is mureka", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalMurekaVoice: false,
      lyricsLanguage: "en",
      env: {
        MUREKA_ENABLED: "true",
        MUSIC_DEFAULT_PROVIDER: "mureka",
      },
    });
    assert.equal("providerId" in result && result.providerId, "sunoapi");
  });

  it("production without rollout rejects personal voice (no Suno fallback)", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalMurekaVoice: true,
      lyricsLanguage: "en",
      appEnv: "production",
      env: {
        MUREKA_ENABLED: "true",
        MUREKA_PERSONAL_VOICE_ENABLED: "true",
        MUREKA_API_KEY: "key",
        MUREKA_BASE_URL: "https://api.mureka.ai",
        MUREKA_PRODUCTION_ROLLOUT_ENABLED: "false",
        MUSIC_DEFAULT_PROVIDER: "mureka",
      },
    });
    assert.equal("error" in result, true);
    if ("error" in result) {
      assert.equal(result.error.code, "MUREKA_PERSONAL_VOICE_UNAVAILABLE");
    }
  });

  it("production with rollout routes personal voice to mureka", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalMurekaVoice: true,
      lyricsLanguage: "en",
      appEnv: "production",
      env: {
        MUREKA_ENABLED: "true",
        MUREKA_PERSONAL_VOICE_ENABLED: "true",
        MUREKA_API_KEY: "key",
        MUREKA_BASE_URL: "https://api.mureka.ai",
        MUREKA_PRODUCTION_ROLLOUT_ENABLED: "true",
        MUSIC_DEFAULT_PROVIDER: "sunoapi",
      },
    });
    assert.equal("providerId" in result && result.providerId, "mureka");
  });

  it("production My Voice OFF stays sunoapi regardless of rollout", () => {
    const result = resolveMusicProviderForGeneration({
      hasPersonalMurekaVoice: false,
      lyricsLanguage: "en",
      appEnv: "production",
      env: {
        MUREKA_ENABLED: "true",
        MUREKA_PERSONAL_VOICE_ENABLED: "true",
        MUREKA_PRODUCTION_ROLLOUT_ENABLED: "true",
        MUSIC_DEFAULT_PROVIDER: "mureka",
      },
    });
    assert.equal("providerId" in result && result.providerId, "sunoapi");
  });
});

/**
 * Music base URL isolation from Legacyengine Voice.
 * Run: pnpm --filter @ai-music/ai-providers exec tsx src/music/music-config.base-url.test.ts
 */
import assert from "node:assert/strict";
import {
  assertSafeLegacyengineMusicApiBaseUrl,
  resolveMusicProviderConfig,
} from "./music-config.js";
import { resolveLegacyengineVoiceConfig } from "../legacyengine-voice/legacyengine-voice-config.js";

function run() {
  const music = resolveMusicProviderConfig({
    LEGACYENGINE_MUSIC_API_BASE_URL: "http://fake.example:4010",
    LEGACYENGINE_API_BASE_URL: "https://integration.example.invalid",
    APP_ENV: "staging",
  });
  assert.equal(music.legacyengineApiBaseUrl, "http://fake.example:4010");

  const voice = resolveLegacyengineVoiceConfig({
    LEGACYENGINE_MUSIC_API_BASE_URL: "http://fake.example:4010",
    LEGACYENGINE_API_BASE_URL: "https://integration.example.invalid",
  });
  assert.equal(voice.apiBaseUrl, "https://integration.example.invalid");

  assert.doesNotThrow(() =>
    assertSafeLegacyengineMusicApiBaseUrl("https://integration.example.invalid", "production"),
  );
  assert.throws(() => assertSafeLegacyengineMusicApiBaseUrl("http://fake.example", "production"));

  console.log("music-config base URL isolation tests passed");
}

run();

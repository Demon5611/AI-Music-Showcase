/**
 * Music base URL isolation from Suno Voice.
 * Run: pnpm --filter @ai-music/ai-providers exec tsx src/music/music-config.base-url.test.ts
 */
import assert from "node:assert/strict";
import {
  assertSafeSunoMusicApiBaseUrl,
  resolveMusicProviderConfig,
} from "./music-config.js";
import { resolveSunoVoiceConfig } from "../suno-voice/suno-voice-config.js";

function run() {
  const music = resolveMusicProviderConfig({
    SUNO_MUSIC_API_BASE_URL: "http://fake.example:4010",
    SUNO_API_BASE_URL: "https://api.sunoapi.org",
    APP_ENV: "staging",
  });
  assert.equal(music.sunoApiBaseUrl, "http://fake.example:4010");

  const voice = resolveSunoVoiceConfig({
    SUNO_MUSIC_API_BASE_URL: "http://fake.example:4010",
    SUNO_API_BASE_URL: "https://api.sunoapi.org",
  });
  assert.equal(voice.apiBaseUrl, "https://api.sunoapi.org");

  assert.doesNotThrow(() =>
    assertSafeSunoMusicApiBaseUrl("https://api.sunoapi.org", "production"),
  );
  assert.throws(() => assertSafeSunoMusicApiBaseUrl("http://fake.example", "production"));

  console.log("music-config base URL isolation tests passed");
}

run();

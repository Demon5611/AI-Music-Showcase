/**
 * Audioengine production rollout gate — generate/voice-profile guards.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/audioengine-production-rollout.contract.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isAudioengineGenerateRuntimeReady,
  resolveAudioenginePersonalVoiceAvailability,
} from "@ai-music/shared";

const here = dirname(fileURLToPath(import.meta.url));

const generateAudioengine = readFileSync(join(here, "music-generate-audioengine.ts"), "utf8");
const voiceProfiles = readFileSync(
  join(here, "../voice-profiles/service.ts"),
  "utf8",
);
const musicService = readFileSync(join(here, "service.ts"), "utf8");

assert.match(generateAudioengine, /isAudioengineWorkerListenHeartbeatFresh/);
assert.match(generateAudioengine, /async function assertAudioengineGenerateAllowed/);
assert.match(voiceProfiles, /isAudioengineWorkerListenHeartbeatFresh/);
assert.match(musicService, /workerHeartbeatFresh/);
assert.match(musicService, /await assertAudioengineGenerateAllowed/);
assert.doesNotMatch(
  generateAudioengine,
  /if \(env\.APP_ENV === "production"\) \{\s*throw new ForbiddenError\("Audioengine generation is not available"\)/,
);

const prodBlocked = {
  AUDIOENGINE_ENABLED: "true",
  AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
  AUDIOENGINE_API_KEY: "key",
  AUDIOENGINE_BASE_URL: "https://integration.example.invalid",
  AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED: "false",
};

assert.equal(
  resolveAudioenginePersonalVoiceAvailability({
    appEnv: "production",
    env: prodBlocked,
  }).available,
  false,
);
assert.equal(
  isAudioengineGenerateRuntimeReady({ appEnv: "production", env: prodBlocked }),
  false,
);

const prodReady = {
  ...prodBlocked,
  AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED: "true",
};
assert.equal(
  resolveAudioenginePersonalVoiceAvailability({
    appEnv: "production",
    env: prodReady,
  }).available,
  true,
);
assert.equal(
  isAudioengineGenerateRuntimeReady({ appEnv: "production", env: prodReady }),
  true,
);

const prodNoKey = {
  AUDIOENGINE_ENABLED: "true",
  AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
  AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED: "true",
  AUDIOENGINE_BASE_URL: "https://integration.example.invalid",
};
assert.equal(
  isAudioengineGenerateRuntimeReady({ appEnv: "production", env: prodNoKey }),
  false,
);

console.log("audioengine-production-rollout.contract.test.ts: ok");

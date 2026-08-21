/**
 * Mureka production rollout gate — generate/voice-profile guards.
 * Run: pnpm --filter @ai-music/api exec tsx src/modules/music/mureka-production-rollout.contract.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isMurekaGenerateRuntimeReady,
  resolveMurekaPersonalVoiceAvailability,
} from "@ai-music/shared";

const here = dirname(fileURLToPath(import.meta.url));

const generateMureka = readFileSync(join(here, "music-generate-mureka.ts"), "utf8");
const voiceProfiles = readFileSync(
  join(here, "../voice-profiles/service.ts"),
  "utf8",
);
const musicService = readFileSync(join(here, "service.ts"), "utf8");

assert.match(generateMureka, /isMurekaWorkerListenHeartbeatFresh/);
assert.match(generateMureka, /async function assertMurekaGenerateAllowed/);
assert.match(voiceProfiles, /isMurekaWorkerListenHeartbeatFresh/);
assert.match(musicService, /workerHeartbeatFresh/);
assert.match(musicService, /await assertMurekaGenerateAllowed/);
assert.doesNotMatch(
  generateMureka,
  /if \(env\.APP_ENV === "production"\) \{\s*throw new ForbiddenError\("Mureka generation is not available"\)/,
);

const prodBlocked = {
  MUREKA_ENABLED: "true",
  MUREKA_PERSONAL_VOICE_ENABLED: "true",
  MUREKA_API_KEY: "key",
  MUREKA_BASE_URL: "https://api.mureka.ai",
  MUREKA_PRODUCTION_ROLLOUT_ENABLED: "false",
};

assert.equal(
  resolveMurekaPersonalVoiceAvailability({
    appEnv: "production",
    env: prodBlocked,
  }).available,
  false,
);
assert.equal(
  isMurekaGenerateRuntimeReady({ appEnv: "production", env: prodBlocked }),
  false,
);

const prodReady = {
  ...prodBlocked,
  MUREKA_PRODUCTION_ROLLOUT_ENABLED: "true",
};
assert.equal(
  resolveMurekaPersonalVoiceAvailability({
    appEnv: "production",
    env: prodReady,
  }).available,
  true,
);
assert.equal(
  isMurekaGenerateRuntimeReady({ appEnv: "production", env: prodReady }),
  true,
);

const prodNoKey = {
  MUREKA_ENABLED: "true",
  MUREKA_PERSONAL_VOICE_ENABLED: "true",
  MUREKA_PRODUCTION_ROLLOUT_ENABLED: "true",
  MUREKA_BASE_URL: "https://api.mureka.ai",
};
assert.equal(
  isMurekaGenerateRuntimeReady({ appEnv: "production", env: prodNoKey }),
  false,
);

console.log("mureka-production-rollout.contract.test.ts: ok");

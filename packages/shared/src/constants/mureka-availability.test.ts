/**
 * Mureka production rollout availability.
 * Run: pnpm --filter @ai-music/shared exec tsx --test src/constants/mureka-availability.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMurekaGenerateRuntimeReady,
  isMurekaWorkerListenReady,
  resolveMurekaPersonalVoiceAvailability,
} from "./mureka-availability.js";

const readyRuntime = {
  MUREKA_ENABLED: "true",
  MUREKA_PERSONAL_VOICE_ENABLED: "true",
  MUREKA_API_KEY: "test-key",
  MUREKA_BASE_URL: "https://api.mureka.ai",
};

describe("resolveMurekaPersonalVoiceAvailability", () => {
  it("blocks production when rollout is false even if all other flags are true", () => {
    const result = resolveMurekaPersonalVoiceAvailability({
      appEnv: "production",
      env: {
        ...readyRuntime,
        MUREKA_PRODUCTION_ROLLOUT_ENABLED: "false",
      },
    });
    assert.equal(result.available, false);
    assert.equal(result.reason, "production_rollout_disabled");
    assert.equal(result.workerListenReady, false);
    assert.equal(isMurekaGenerateRuntimeReady({ appEnv: "production", env: {
      ...readyRuntime,
      MUREKA_PRODUCTION_ROLLOUT_ENABLED: "false",
    } }), false);
  });

  it("allows production when rollout and runtime prerequisites are valid", () => {
    const env = {
      ...readyRuntime,
      MUREKA_PRODUCTION_ROLLOUT_ENABLED: "true",
    };
    const result = resolveMurekaPersonalVoiceAvailability({
      appEnv: "production",
      env,
    });
    assert.equal(result.available, true);
    assert.equal(result.reason, null);
    assert.equal(result.workerListenReady, true);
    assert.equal(isMurekaGenerateRuntimeReady({ appEnv: "production", env }), true);
  });

  it("fails closed in production when MUREKA_ENABLED is false", () => {
    const result = resolveMurekaPersonalVoiceAvailability({
      appEnv: "production",
      env: {
        ...readyRuntime,
        MUREKA_ENABLED: "false",
        MUREKA_PRODUCTION_ROLLOUT_ENABLED: "true",
      },
    });
    assert.equal(result.available, false);
    assert.equal(result.reason, "mureka_disabled");
  });

  it("fails closed in production when API key is missing", () => {
    const result = resolveMurekaPersonalVoiceAvailability({
      appEnv: "production",
      env: {
        MUREKA_ENABLED: "true",
        MUREKA_PERSONAL_VOICE_ENABLED: "true",
        MUREKA_PRODUCTION_ROLLOUT_ENABLED: "true",
        MUREKA_BASE_URL: "https://api.mureka.ai",
      },
    });
    assert.equal(result.available, false);
    assert.equal(result.reason, "runtime_not_ready");
    assert.equal(result.workerListenReady, false);
  });

  it("keeps staging available with enabled+personalVoice without rollout flag", () => {
    const result = resolveMurekaPersonalVoiceAvailability({
      appEnv: "staging",
      env: {
        MUREKA_ENABLED: "true",
        MUREKA_PERSONAL_VOICE_ENABLED: "true",
      },
    });
    assert.equal(result.available, true);
    assert.equal(result.reason, null);
    // Without key/url worker is not listen-ready — generate must still fail closed.
    assert.equal(result.workerListenReady, false);
    assert.equal(
      isMurekaGenerateRuntimeReady({
        appEnv: "staging",
        env: {
          MUREKA_ENABLED: "true",
          MUREKA_PERSONAL_VOICE_ENABLED: "true",
        },
      }),
      false,
    );
  });

  it("staging with full runtime is generate-ready", () => {
    assert.equal(
      isMurekaGenerateRuntimeReady({
        appEnv: "staging",
        env: readyRuntime,
      }),
      true,
    );
    assert.equal(isMurekaWorkerListenReady("staging", readyRuntime), true);
  });
});

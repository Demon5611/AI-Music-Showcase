/**
 * Audioengine production rollout availability.
 * Run: pnpm --filter @ai-music/shared exec tsx --test src/constants/audioengine-availability.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAudioengineGenerateRuntimeReady,
  isAudioengineWorkerListenReady,
  resolveAudioenginePersonalVoiceAvailability,
} from "./audioengine-availability.js";

const readyRuntime = {
  AUDIOENGINE_ENABLED: "true",
  AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
  AUDIOENGINE_API_KEY: "test-key",
  AUDIOENGINE_BASE_URL: "https://integration.example.invalid",
};

describe("resolveAudioenginePersonalVoiceAvailability", () => {
  it("blocks production when rollout is false even if all other flags are true", () => {
    const result = resolveAudioenginePersonalVoiceAvailability({
      appEnv: "production",
      env: {
        ...readyRuntime,
        AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED: "false",
      },
    });
    assert.equal(result.available, false);
    assert.equal(result.reason, "production_rollout_disabled");
    assert.equal(result.workerListenReady, false);
    assert.equal(isAudioengineGenerateRuntimeReady({ appEnv: "production", env: {
      ...readyRuntime,
      AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED: "false",
    } }), false);
  });

  it("allows production when rollout and runtime prerequisites are valid", () => {
    const env = {
      ...readyRuntime,
      AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED: "true",
    };
    const result = resolveAudioenginePersonalVoiceAvailability({
      appEnv: "production",
      env,
    });
    assert.equal(result.available, true);
    assert.equal(result.reason, null);
    assert.equal(result.workerListenReady, true);
    assert.equal(isAudioengineGenerateRuntimeReady({ appEnv: "production", env }), true);
  });

  it("fails closed in production when AUDIOENGINE_ENABLED is false", () => {
    const result = resolveAudioenginePersonalVoiceAvailability({
      appEnv: "production",
      env: {
        ...readyRuntime,
        AUDIOENGINE_ENABLED: "false",
        AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED: "true",
      },
    });
    assert.equal(result.available, false);
    assert.equal(result.reason, "audioengine_disabled");
  });

  it("fails closed in production when API key is missing", () => {
    const result = resolveAudioenginePersonalVoiceAvailability({
      appEnv: "production",
      env: {
        AUDIOENGINE_ENABLED: "true",
        AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
        AUDIOENGINE_PRODUCTION_ROLLOUT_ENABLED: "true",
        AUDIOENGINE_BASE_URL: "https://integration.example.invalid",
      },
    });
    assert.equal(result.available, false);
    assert.equal(result.reason, "runtime_not_ready");
    assert.equal(result.workerListenReady, false);
  });

  it("keeps staging available with enabled+personalVoice without rollout flag", () => {
    const result = resolveAudioenginePersonalVoiceAvailability({
      appEnv: "staging",
      env: {
        AUDIOENGINE_ENABLED: "true",
        AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
      },
    });
    assert.equal(result.available, true);
    assert.equal(result.reason, null);
    // Without key/url worker is not listen-ready — generate must still fail closed.
    assert.equal(result.workerListenReady, false);
    assert.equal(
      isAudioengineGenerateRuntimeReady({
        appEnv: "staging",
        env: {
          AUDIOENGINE_ENABLED: "true",
          AUDIOENGINE_PERSONAL_VOICE_ENABLED: "true",
        },
      }),
      false,
    );
  });

  it("staging with full runtime is generate-ready", () => {
    assert.equal(
      isAudioengineGenerateRuntimeReady({
        appEnv: "staging",
        env: readyRuntime,
      }),
      true,
    );
    assert.equal(isAudioengineWorkerListenReady("staging", readyRuntime), true);
  });
});

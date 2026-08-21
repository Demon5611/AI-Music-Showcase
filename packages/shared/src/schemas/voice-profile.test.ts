import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isVoiceProfileStatus,
  VOICE_PROFILE_ACTIVE_STATUSES,
  VOICE_PROFILE_STATUSES,
  VOICE_PROFILE_USER_VISIBLE_STATUSES,
} from "../constants/mureka-flags.js";
import { createMurekaVoiceProfileSchema } from "./voice-profile.js";

describe("createMurekaVoiceProfileSchema", () => {
  it("accepts explicit consent and a sample id", () => {
    const result = createMurekaVoiceProfileSchema.safeParse({
      voiceSampleId: "sample-1",
      consentConfirmed: true,
    });

    assert.equal(result.success, true);
  });

  it("rejects missing consent", () => {
    const result = createMurekaVoiceProfileSchema.safeParse({
      voiceSampleId: "sample-1",
      consentConfirmed: false,
    });

    assert.equal(result.success, false);
  });
});

describe("VoiceProfileStatus lifecycle", () => {
  it("includes deletion_requested and excludes deleted profiles from user visibility", () => {
    assert.equal(isVoiceProfileStatus("deletion_requested"), true);
    assert.equal(isVoiceProfileStatus("provider_deleted"), true);
    assert.equal(isVoiceProfileStatus("deleted"), false);
    assert.deepEqual([...VOICE_PROFILE_USER_VISIBLE_STATUSES], [
      "creating",
      "ready",
      "failed",
    ]);
    assert.deepEqual([...VOICE_PROFILE_ACTIVE_STATUSES], ["creating", "ready"]);
    assert.ok(VOICE_PROFILE_STATUSES.includes("deletion_requested"));
  });
});

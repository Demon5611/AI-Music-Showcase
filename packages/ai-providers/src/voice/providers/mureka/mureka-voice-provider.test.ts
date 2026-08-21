import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_MUREKA_VOICE_DELETION_SCOPE } from "@ai-music/shared";
import { createMurekaVoiceProvider } from "./mureka-voice-provider.js";

describe("MurekaVoiceProvider.requestVoiceProfileDeletion", () => {
  it("returns manual mode without HTTP", async () => {
    const provider = createMurekaVoiceProvider();
    const result = await provider.requestVoiceProfileDeletion!({
      provider: "mureka",
      externalId: "vocal-abc",
      voiceProfileId: "vp-1",
      deletionScope: DEFAULT_MUREKA_VOICE_DELETION_SCOPE,
    });

    assert.equal(result.mode, "manual");
    assert.equal(result.requiresOperatorAction, true);
    assert.equal(result.externalId, "vocal-abc");
  });

  it("rejects pending external ids", async () => {
    const provider = createMurekaVoiceProvider();
    await assert.rejects(
      () =>
        provider.requestVoiceProfileDeletion!({
          provider: "mureka",
          externalId: "pending:vp-1",
          voiceProfileId: "vp-1",
          deletionScope: DEFAULT_MUREKA_VOICE_DELETION_SCOPE,
        }),
      /no provider Vocal ID/,
    );
  });
});

console.log("mureka-voice-provider.test.ts: ok");

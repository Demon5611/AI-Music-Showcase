import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_AUDIOENGINE_VOICE_DELETION_SCOPE } from "@ai-music/shared";
import { createAudioengineVoiceProvider } from "./audioengine-voice-provider.js";

describe("AudioengineVoiceProvider.requestVoiceProfileDeletion", () => {
  it("returns manual mode without HTTP", async () => {
    const provider = createAudioengineVoiceProvider();
    const result = await provider.requestVoiceProfileDeletion!({
      provider: "audioengine",
      externalId: "vocal-abc",
      voiceProfileId: "vp-1",
      deletionScope: DEFAULT_AUDIOENGINE_VOICE_DELETION_SCOPE,
    });

    assert.equal(result.mode, "manual");
    assert.equal(result.requiresOperatorAction, true);
    assert.equal(result.externalId, "vocal-abc");
  });

  it("rejects pending external ids", async () => {
    const provider = createAudioengineVoiceProvider();
    await assert.rejects(
      () =>
        provider.requestVoiceProfileDeletion!({
          provider: "audioengine",
          externalId: "pending:vp-1",
          voiceProfileId: "vp-1",
          deletionScope: DEFAULT_AUDIOENGINE_VOICE_DELETION_SCOPE,
        }),
      /no provider Vocal ID/,
    );
  });
});

console.log("audioengine-voice-provider.test.ts: ok");

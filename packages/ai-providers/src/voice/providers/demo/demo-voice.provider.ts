import type {
  RequestVoiceProfileDeletionInput,
  VoiceDeletionRequestResult,
  VoiceProvider,
} from "../../voice-deletion.types.js";

/**
 * Deterministic VoiceProvider for SHOWCASE_MODE.
 * Does not call commercial vocal-clone APIs.
 */
export class DemoVoiceProvider implements VoiceProvider {
  readonly id = "demo-voice";

  async requestVoiceProfileDeletion(
    input: RequestVoiceProfileDeletionInput,
  ): Promise<VoiceDeletionRequestResult> {
    return {
      mode: "manual",
      requiresOperatorAction: true,
      externalId: input.externalId || "voice_demo_001",
    };
  }
}

export function createDemoVoiceProvider(): DemoVoiceProvider {
  return new DemoVoiceProvider();
}

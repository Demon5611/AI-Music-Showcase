import { AUDIOENGINE_PROVIDER_ID } from "../../../music/providers/audioengine/audioengine-types.js";
import type {
  RequestVoiceProfileDeletionInput,
  VoiceDeletionRequestResult,
  VoiceProvider,
} from "../../voice-deletion.types.js";

/**
 * Audioengine has no public Vocal ID delete API. Deletion is manual via provider support.
 */
export class AudioengineVoiceProvider implements VoiceProvider {
  readonly id = AUDIOENGINE_PROVIDER_ID;

  async requestVoiceProfileDeletion(
    input: RequestVoiceProfileDeletionInput,
  ): Promise<VoiceDeletionRequestResult> {
    const externalId = input.externalId.trim();

    if (!externalId || externalId.startsWith("pending:")) {
      throw new Error("Audioengine voice profile has no provider Vocal ID to delete");
    }

    return {
      mode: "manual",
      requiresOperatorAction: true,
      externalId,
    };
  }
}

export function createAudioengineVoiceProvider(): AudioengineVoiceProvider {
  return new AudioengineVoiceProvider();
}

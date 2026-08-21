import { MUREKA_PROVIDER_ID } from "../../../music/providers/mureka/mureka-types.js";
import type {
  RequestVoiceProfileDeletionInput,
  VoiceDeletionRequestResult,
  VoiceProvider,
} from "../../voice-deletion.types.js";

/**
 * Mureka has no public Vocal ID delete API. Deletion is manual via provider support.
 */
export class MurekaVoiceProvider implements VoiceProvider {
  readonly id = MUREKA_PROVIDER_ID;

  async requestVoiceProfileDeletion(
    input: RequestVoiceProfileDeletionInput,
  ): Promise<VoiceDeletionRequestResult> {
    const externalId = input.externalId.trim();

    if (!externalId || externalId.startsWith("pending:")) {
      throw new Error("Mureka voice profile has no provider Vocal ID to delete");
    }

    return {
      mode: "manual",
      requiresOperatorAction: true,
      externalId,
    };
  }
}

export function createMurekaVoiceProvider(): MurekaVoiceProvider {
  return new MurekaVoiceProvider();
}

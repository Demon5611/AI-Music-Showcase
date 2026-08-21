import type { VoiceDeletionScope } from "@ai-music/shared";

export type VoiceDeletionRequestResult =
  | {
      mode: "manual";
      requiresOperatorAction: true;
      externalId: string;
    }
  | {
      mode: "api";
      requiresOperatorAction: false;
      externalId: string;
      providerRequestId?: string;
    };

export type RequestVoiceProfileDeletionInput = {
  provider: string;
  externalId: string;
  voiceProfileId: string;
  deletionScope: VoiceDeletionScope;
};

export interface VoiceProvider {
  readonly id: string;
  requestVoiceProfileDeletion?(
    input: RequestVoiceProfileDeletionInput,
  ): Promise<VoiceDeletionRequestResult>;
}

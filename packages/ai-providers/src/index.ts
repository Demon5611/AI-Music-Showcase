import type {
  ConvertVoiceInput,
  ConvertedVoiceResult,
  VoiceConversionProvider,
} from "./types.js";
import { createVoiceadapterClient } from "./voiceadapter/create-voiceadapter-client.js";
import type { CreateVoiceadapterVoiceConversionInput } from "./voiceadapter/types.js";
import { VoiceadapterClient } from "./voiceadapter/voiceadapter-client.js";

export class VoiceadapterVoiceConversionProvider implements VoiceConversionProvider {
  constructor(private readonly client: VoiceadapterClient = createVoiceadapterClient()) {}

  async convertVoice(input: ConvertVoiceInput): Promise<ConvertedVoiceResult> {
    void input;
    throw new Error(
      "VoiceadapterVoiceConversionProvider.convertVoice: use VoiceadapterClient for file-based flow",
    );
  }

  createJob(input: CreateVoiceadapterVoiceConversionInput) {
    return this.client.createVoiceConversion(input);
  }

  getJob(id: number) {
    return this.client.getVoiceConversion(id);
  }
}

export { VoiceadapterClient, createVoiceadapterClient };
export { VoiceadapterApiError } from "./voiceadapter/voiceadapter-api-error.js";
export {
  downloadUrl,
  isVoiceadapterJobFailed,
  isVoiceadapterJobRunning,
  isVoiceadapterJobSuccess,
  pollUntilComplete,
} from "./voiceadapter/poll.js";
export type {
  CreateVoiceadapterVoiceConversionInput,
  CreateVoiceadapterVocalSeparationInput,
  VoiceadapterInferenceJob,
  VoiceadapterVoiceModel,
  VoiceadapterVocalSeparationJob,
  ListVoiceadapterVoiceModelsParams,
} from "./voiceadapter/types.js";
export * from "./types.js";
export * from "./music/index.js";
export * from "./video/index.js";
export type {
  VoiceDeletionRequestResult,
  RequestVoiceProfileDeletionInput,
  VoiceProvider,
} from "./voice/voice-deletion.types.js";
export { createVoiceProvider } from "./voice/create-voice-provider.js";
export {
  AudioengineVoiceProvider,
  createAudioengineVoiceProvider,
} from "./voice/providers/audioengine/audioengine-voice-provider.js";
export {
  createLegacyengineVoiceClients,
  isLegacyengineVoiceTaskFailed,
  isLegacyengineVoiceTaskPending,
  resolveLegacyengineVoiceConfig,
  LegacyengineFileUploadClient,
  LegacyengineVoiceClient,
} from "./legacyengine-voice/create-legacyengine-voice-clients.js";
export type {
  LegacyengineFileUploadResult,
  LegacyengineVoiceConfig,
  LegacyengineVoiceGenerateRequest,
  LegacyengineVoiceRecordInfo,
  LegacyengineVoiceTaskStatus,
  LegacyengineVoiceValidateInfo,
  LegacyengineVoiceValidateRequest,
} from "./legacyengine-voice/legacyengine-voice.types.js";

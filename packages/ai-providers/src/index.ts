import type {
  ConvertVoiceInput,
  ConvertedVoiceResult,
  VoiceConversionProvider,
} from "./types.js";
import { createKitsClient } from "./kits/create-kits-client.js";
import type { CreateKitsVoiceConversionInput } from "./kits/types.js";
import { KitsClient } from "./kits/kits-client.js";

export class KitsVoiceConversionProvider implements VoiceConversionProvider {
  constructor(private readonly client: KitsClient = createKitsClient()) {}

  async convertVoice(input: ConvertVoiceInput): Promise<ConvertedVoiceResult> {
    void input;
    throw new Error(
      "KitsVoiceConversionProvider.convertVoice: use KitsClient for file-based flow",
    );
  }

  createJob(input: CreateKitsVoiceConversionInput) {
    return this.client.createVoiceConversion(input);
  }

  getJob(id: number) {
    return this.client.getVoiceConversion(id);
  }
}

export { KitsClient, createKitsClient };
export { KitsApiError } from "./kits/kits-api-error.js";
export {
  downloadUrl,
  isKitsJobFailed,
  isKitsJobRunning,
  isKitsJobSuccess,
  pollUntilComplete,
} from "./kits/poll.js";
export type {
  CreateKitsVoiceConversionInput,
  CreateKitsVocalSeparationInput,
  KitsInferenceJob,
  KitsVoiceModel,
  KitsVocalSeparationJob,
  ListKitsVoiceModelsParams,
} from "./kits/types.js";
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

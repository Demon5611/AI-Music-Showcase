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
export type {
  VoiceDeletionRequestResult,
  RequestVoiceProfileDeletionInput,
  VoiceProvider,
} from "./voice/voice-deletion.types.js";
export { createVoiceProvider } from "./voice/create-voice-provider.js";
export {
  MurekaVoiceProvider,
  createMurekaVoiceProvider,
} from "./voice/providers/mureka/mureka-voice-provider.js";
export {
  createSunoVoiceClients,
  isSunoVoiceTaskFailed,
  isSunoVoiceTaskPending,
  resolveSunoVoiceConfig,
  SunoFileUploadClient,
  SunoVoiceClient,
} from "./suno-voice/create-suno-voice-clients.js";
export type {
  SunoFileUploadResult,
  SunoVoiceConfig,
  SunoVoiceGenerateRequest,
  SunoVoiceRecordInfo,
  SunoVoiceTaskStatus,
  SunoVoiceValidateInfo,
  SunoVoiceValidateRequest,
} from "./suno-voice/suno-voice.types.js";

import { resolveSunoVoiceConfig } from "./suno-voice-config.js";
import { SunoFileUploadClient } from "./suno-file-upload.client.js";
import {
  isSunoVoiceTaskFailed,
  isSunoVoiceTaskPending,
  SunoVoiceClient,
} from "./suno-voice.client.js";

export interface CreateSunoVoiceClientsConfig {
  apiBaseUrl: string;
  fileUploadBaseUrl: string;
  apiKey: string;
  requestTimeoutMs: number;
}

export function createSunoVoiceClients(
  config: CreateSunoVoiceClientsConfig = resolveSunoVoiceConfig(),
) {
  const voice = new SunoVoiceClient({
    baseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
    timeoutMs: config.requestTimeoutMs,
  });

  const fileUpload = new SunoFileUploadClient({
    baseUrl: config.fileUploadBaseUrl,
    apiKey: config.apiKey,
    timeoutMs: config.requestTimeoutMs,
  });

  return { voice, fileUpload };
}

export {
  isSunoVoiceTaskFailed,
  isSunoVoiceTaskPending,
  resolveSunoVoiceConfig,
  SunoFileUploadClient,
  SunoVoiceClient,
};

import { resolveLegacyengineVoiceConfig } from "./legacyengine-voice-config.js";
import { LegacyengineFileUploadClient } from "./legacyengine-file-upload.client.js";
import {
  isLegacyengineVoiceTaskFailed,
  isLegacyengineVoiceTaskPending,
  LegacyengineVoiceClient,
} from "./legacyengine-voice.client.js";

export interface CreateLegacyengineVoiceClientsConfig {
  apiBaseUrl: string;
  fileUploadBaseUrl: string;
  apiKey: string;
  requestTimeoutMs: number;
}

export function createLegacyengineVoiceClients(
  config: CreateLegacyengineVoiceClientsConfig = resolveLegacyengineVoiceConfig(),
) {
  const voice = new LegacyengineVoiceClient({
    baseUrl: config.apiBaseUrl,
    apiKey: config.apiKey,
    timeoutMs: config.requestTimeoutMs,
  });

  const fileUpload = new LegacyengineFileUploadClient({
    baseUrl: config.fileUploadBaseUrl,
    apiKey: config.apiKey,
    timeoutMs: config.requestTimeoutMs,
  });

  return { voice, fileUpload };
}

export {
  isLegacyengineVoiceTaskFailed,
  isLegacyengineVoiceTaskPending,
  resolveLegacyengineVoiceConfig,
  LegacyengineFileUploadClient,
  LegacyengineVoiceClient,
};

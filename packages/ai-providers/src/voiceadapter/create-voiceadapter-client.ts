import { VoiceadapterClient } from "./voiceadapter-client.js";

export interface VoiceadapterClientConfig {
  baseUrl?: string;
  apiKey?: string;
}

export function createVoiceadapterClient(config: VoiceadapterClientConfig = {}): VoiceadapterClient {
  const baseUrl = config.baseUrl ?? process.env.VOICEADAPTER_API_BASE_URL;
  const apiKey = config.apiKey ?? process.env.VOICEADAPTER_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("VOICEADAPTER_API_BASE_URL and VOICEADAPTER_API_KEY are required");
  }

  return new VoiceadapterClient(baseUrl.replace(/\/$/, ""), apiKey);
}

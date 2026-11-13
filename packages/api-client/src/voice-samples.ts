import type { VoiceSample } from "@ai-music/shared";
import type { ApiClient } from "./client.js";

export function createVoiceSamplesApi(client: ApiClient) {
  return {
    list: () => client.get<VoiceSample[]>("/api/voice-samples"),
    create: (formData: FormData) =>
      client.postForm<VoiceSample>("/api/voice-samples", formData),
    prepareLegacyengineVoice: (id: string, options?: { restart?: boolean }) =>
      client.post<VoiceSample>(`/api/voice-samples/${id}/legacyengine-voice/prepare`, options ?? {}),
    getLegacyengineVoiceStatus: (id: string) =>
      client.get<VoiceSample>(`/api/voice-samples/${id}/legacyengine-voice/status`),
    cancelLegacyengineVoice: (id: string) =>
      client.post<VoiceSample>(`/api/voice-samples/${id}/legacyengine-voice/cancel`, {}),
    verifyLegacyengineVoice: (id: string, formData: FormData) =>
      client.postForm<VoiceSample>(
        `/api/voice-samples/${id}/legacyengine-voice/verify`,
        formData,
      ),
    remove: (id: string) =>
      client.delete<void>(`/api/voice-samples/${id}`),
    getAudioUrl: (id: string) => `/api/voice-samples/${id}/audio`,
  };
}

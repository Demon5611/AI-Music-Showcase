import type {
  CreateAudioengineVoiceProfileBody,
  VoiceProfileDto,
} from "@ai-music/shared";
import type { ApiClient } from "./client.js";

export function createVoiceProfilesApi(client: ApiClient) {
  return {
    getMine: () =>
      client.get<VoiceProfileDto | null>("/api/voice-profiles/me"),
    createAudioengine: (body: CreateAudioengineVoiceProfileBody) =>
      client.post<VoiceProfileDto>("/api/voice-profiles/audioengine", body),
    requestDeletion: (id: string) =>
      client.post<{
        profile: VoiceProfileDto;
        messageCode: "deletion_registered";
      }>(`/api/voice-profiles/${encodeURIComponent(id)}/request-deletion`, {}),
  };
}

import type {
  CreateMurekaVoiceProfileBody,
  VoiceProfileDto,
} from "@ai-music/shared";
import type { ApiClient } from "./client.js";

export function createVoiceProfilesApi(client: ApiClient) {
  return {
    getMine: () =>
      client.get<VoiceProfileDto | null>("/api/voice-profiles/me"),
    createMureka: (body: CreateMurekaVoiceProfileBody) =>
      client.post<VoiceProfileDto>("/api/voice-profiles/mureka", body),
    requestDeletion: (id: string) =>
      client.post<{
        profile: VoiceProfileDto;
        messageCode: "deletion_registered";
      }>(`/api/voice-profiles/${encodeURIComponent(id)}/request-deletion`, {}),
  };
}

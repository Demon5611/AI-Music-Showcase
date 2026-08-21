"use client";

import { usePollingQuery } from "@/shared/hooks/use-polling-query";
import type { VoiceProfileDto } from "@ai-music/shared";
import { useApi } from "@/shared/providers/api-provider";

const VOICE_PROFILE_POLL_INTERVAL_MS = 4_000;

export const voiceProfileQueryKey = ["voice-profile", "me"] as const;

function isTerminal(profile: VoiceProfileDto | null | undefined): boolean {
  return profile?.status !== "creating";
}

export function useVoiceProfileQuery(authReady: boolean) {
  const api = useApi();

  return usePollingQuery({
    queryKey: voiceProfileQueryKey,
    queryFn: () => api.voiceProfiles.getMine(),
    enabled: authReady,
    isTerminal,
    intervalMs: VOICE_PROFILE_POLL_INTERVAL_MS,
    // A failed refresh must not stop tracking an in-flight clone.
    keepPollingOnErrorWithData: true,
  });
}

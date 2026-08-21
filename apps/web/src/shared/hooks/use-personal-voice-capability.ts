"use client";

import { useQuery } from "@tanstack/react-query";
import { useApi } from "@/shared/providers/api-provider";

export const personalVoiceCapabilityQueryKey = [
  "music",
  "provider-status",
  "personal-voice",
] as const;

/**
 * Server SoT for My Voice / Personal Voice UI.
 * NEXT_PUBLIC_* flags are not security boundaries.
 */
export function usePersonalVoiceCapability(authReady: boolean) {
  const api = useApi();

  return useQuery({
    queryKey: personalVoiceCapabilityQueryKey,
    queryFn: () => api.music.getTestStatus(),
    enabled: authReady,
    staleTime: 30_000,
    select: (data) => ({
      available: data.personalVoice?.available === true,
      reason: data.personalVoice?.reason ?? null,
      productionRolloutEnabled:
        data.personalVoice?.productionRolloutEnabled === true,
      workerListenReady: data.personalVoice?.workerListenReady === true,
    }),
  });
}

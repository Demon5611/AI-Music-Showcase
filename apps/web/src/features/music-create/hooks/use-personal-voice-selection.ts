"use client";

import { useEffect, useState } from "react";
import { usePersonalVoiceCapability } from "@/shared/hooks/use-personal-voice-capability";
import { useVoiceProfileQuery } from "@/shared/hooks/use-voice-profile-query";

export function usePersonalVoiceSelection(authReady: boolean) {
  const capabilityQuery = usePersonalVoiceCapability(authReady);
  const serverAvailable = capabilityQuery.data?.available === true;
  // Hide My Voice toggle until server confirms availability (fail-closed).
  const enabled = serverAvailable;
  const profileQuery = useVoiceProfileQuery(authReady && enabled);
  const [usePersonalVoice, setUsePersonalVoice] = useState(false);
  const readyProfile =
    profileQuery.data?.status === "ready" ? profileQuery.data : null;

  useEffect(() => {
    if (!readyProfile) {
      setUsePersonalVoice(false);
    }
  }, [readyProfile?.id]);

  const setPersonalVoiceEnabled = (enabledNext: boolean) => {
    // Generate payload clears the opposite id; keep boolean selection only.
    setUsePersonalVoice(Boolean(readyProfile) && enabledNext);
  };

  return {
    enabled,
    isLoading: capabilityQuery.isLoading || (enabled && profileQuery.isLoading),
    isError:
      capabilityQuery.isError ||
      (serverAvailable && profileQuery.isError),
    readyProfile,
    usePersonalVoice: Boolean(readyProfile) && usePersonalVoice,
    setUsePersonalVoice: setPersonalVoiceEnabled,
  };
}

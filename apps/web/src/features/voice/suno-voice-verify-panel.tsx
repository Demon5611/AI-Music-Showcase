"use client";

import { useSearchParams } from "next/navigation";
import { SunoVoiceVerifyFlow } from "@/features/voice/suno-voice-verify-flow";

export function SunoVoiceVerifyPanel() {
  const searchParams = useSearchParams();
  const sampleId = searchParams.get("id");

  return <SunoVoiceVerifyFlow sampleId={sampleId} variant="page" />;
}

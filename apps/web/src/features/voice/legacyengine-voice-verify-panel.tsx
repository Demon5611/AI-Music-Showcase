"use client";

import { useSearchParams } from "next/navigation";
import { LegacyengineVoiceVerifyFlow } from "@/features/voice/legacyengine-voice-verify-flow";

export function LegacyengineVoiceVerifyPanel() {
  const searchParams = useSearchParams();
  const sampleId = searchParams.get("id");

  return <LegacyengineVoiceVerifyFlow sampleId={sampleId} variant="page" />;
}

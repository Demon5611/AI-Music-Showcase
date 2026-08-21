"use client";

import { useTranslations } from "next-intl";
import { AuthGate } from "@/shared/ui/auth-gate";

type VoiceAuthGateVariant = "landing" | "page";

interface VoiceAuthGateProps {
  variant?: VoiceAuthGateVariant;
}

export function VoiceAuthGate({ variant = "landing" }: VoiceAuthGateProps) {
  const tLanding = useTranslations("Landing.voiceGate");
  const tVoice = useTranslations("VoiceUpload");
  const isLanding = variant === "landing";

  return (
    <AuthGate
      hint={isLanding ? tLanding("hint") : tVoice("pageAuthHint")}
      layout={isLanding ? "inline" : "page"}
      title={isLanding ? tLanding("title") : tVoice("authTitle")}
    />
  );
}

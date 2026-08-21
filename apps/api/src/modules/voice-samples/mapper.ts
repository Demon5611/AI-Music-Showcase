import type { VoiceSample as VoiceSampleDto } from "@ai-music/shared";
import { normalizeVoiceLanguage } from "@ai-music/shared";
import type { VoiceSample } from "@ai-music/db";
import { isReadyForMusicGeneration } from "./persona-voice-id.service.js";

export function toVoiceSampleDto(
  sample: VoiceSample,
  personaVoiceId: string | null = null,
): VoiceSampleDto {
  return {
    id: sample.id,
    userId: sample.userId,
    durationSec: sample.durationSec,
    status: sample.status as VoiceSampleDto["status"],
    consentConfirmed: sample.consentConfirmed,
    voiceLanguage: normalizeVoiceLanguage(sample.voiceLanguage),
    sunoValidatePhrase: sample.sunoValidatePhrase,
    voiceCloneStatus: sample.voiceCloneStatus as VoiceSampleDto["voiceCloneStatus"],
    voiceCloneError: sample.voiceCloneError,
    voiceCloneStartedAt: sample.voiceCloneStartedAt?.toISOString() ?? null,
    readyForMusicGeneration: isReadyForMusicGeneration(sample, personaVoiceId),
    createdAt: sample.createdAt.toISOString(),
  };
}

export async function toVoiceSampleDtoWithPersonaCheck(
  sample: VoiceSample,
  resolvePersonaVoiceId: (
    sample: VoiceSample,
    options?: { persistCorrection?: boolean },
  ) => Promise<string | null>,
): Promise<VoiceSampleDto> {
  const shouldCheck =
    sample.voiceCloneStatus === "ready" || Boolean(sample.sunoVoiceId?.trim());

  const personaVoiceId = shouldCheck
    ? await resolvePersonaVoiceId(sample, { persistCorrection: true })
    : null;

  return toVoiceSampleDto(sample, personaVoiceId);
}

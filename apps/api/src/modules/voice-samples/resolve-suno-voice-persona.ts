import { createSunoVoiceClients } from "@ai-music/ai-providers";
import { prisma } from "@ai-music/db";
import {
  PERSONA_VOICE_UNAVAILABLE_MESSAGE,
  resolvePersonaVoiceId,
} from "./persona-voice-id.service.js";

export async function findReadySunoVoiceSample(userId: string, voiceSampleId?: string) {
  return prisma.voiceSample.findFirst({
    where: {
      userId,
      status: "ready",
      consentConfirmed: true,
      voiceCloneStatus: "ready",
      sunoVoiceId: { not: null },
      ...(voiceSampleId ? { id: voiceSampleId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

async function resolvePersonaForVoiceSample(userId: string, voiceSampleId?: string) {
  const found = await findReadySunoVoiceSample(userId, voiceSampleId);

  if (!found) {
    return null;
  }

  const personaId = await resolvePersonaVoiceId(found, { persistCorrection: true });

  if (!personaId) {
    return null;
  }

  const sample = await prisma.voiceSample.findFirst({
    where: { id: found.id, userId },
  });

  if (!sample || sample.voiceCloneStatus !== "ready") {
    return null;
  }

  return {
    voiceSampleId: sample.id,
    personaId,
    sunoVoiceTaskId: sample.sunoVoiceTaskId,
    personaModel: "voice_persona" as const,
  };
}

export async function resolveSunoVoicePersonaForUser(userId: string, voiceSampleId?: string) {
  const persona = await resolvePersonaForVoiceSample(userId, voiceSampleId);

  if (persona || !voiceSampleId) {
    return persona;
  }

  return resolvePersonaForVoiceSample(userId);
}

export async function assertPersonaVoiceAvailable(personaId: string): Promise<boolean> {
  const { voice } = createSunoVoiceClients();
  return voice.checkPersonaVoiceAvailability(personaId);
}

export { PERSONA_VOICE_UNAVAILABLE_MESSAGE, resolvePersonaVoiceId };

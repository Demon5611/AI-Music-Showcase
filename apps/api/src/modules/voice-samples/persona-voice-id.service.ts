import type { VoiceSample } from "@ai-music/db";
import { createLegacyengineVoiceClients } from "@ai-music/ai-providers";
import { prisma } from "@ai-music/db";
import { resolveLegacyengineRecordVoiceId } from "./resolve-legacyengine-record-voice-id.js";

const PERSONA_VOICE_UNAVAILABLE_MESSAGE =
  "Подтверждение голоса не прошло. Пройдите верификацию заново.";

const PERSONA_CHECK_RETRIES = 3;
const PERSONA_CHECK_DELAY_MS = 2_000;

export interface ResolvePersonaVoiceIdOptions {
  persistCorrection?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function checkPersonaAvailableWithRetry(personaVoiceId: string): Promise<boolean> {
  const { voice } = createLegacyengineVoiceClients();

  for (let attempt = 0; attempt < PERSONA_CHECK_RETRIES; attempt += 1) {
    if (await voice.checkPersonaVoiceAvailability(personaVoiceId)) {
      return true;
    }

    if (attempt < PERSONA_CHECK_RETRIES - 1) {
      await sleep(PERSONA_CHECK_DELAY_MS);
    }
  }

  return false;
}

async function persistPersonaVoiceId(
  sampleId: string,
  personaVoiceId: string,
): Promise<void> {
  await prisma.voiceSample.update({
    where: { id: sampleId },
    data: {
      legacyengineVoiceId: personaVoiceId,
      voiceCloneStatus: "ready",
      voiceCloneError: null,
    },
  });
}

/**
 * Single source of truth for Legacyengine persona id used in music generate.
 *
 * - legacyengineVoiceTaskId → task_id (validate/generate pipeline), record-info polling
 * - legacyengineVoiceId     → persona id from record-info voiceId (may equal task_id on Legacyengine)
 */
export async function resolvePersonaVoiceId(
  sample: VoiceSample,
  options: ResolvePersonaVoiceIdOptions = {},
): Promise<string | null> {
  const { voice } = createLegacyengineVoiceClients();
  const taskId = sample.legacyengineVoiceTaskId?.trim();
  let personaVoiceId = sample.legacyengineVoiceId?.trim() ?? "";

  if (taskId) {
    try {
      const recordInfo = await voice.getVoiceRecordInfo(taskId);
      const recordVoiceId = resolveLegacyengineRecordVoiceId(recordInfo);

      if (recordVoiceId) {
        personaVoiceId = recordVoiceId;
      } else if (String(recordInfo.status) === "success") {
        personaVoiceId = "";
      }
    } catch {
      // Fall back to stored legacyengineVoiceId below.
    }
  }

  if (!personaVoiceId && sample.legacyengineVoiceId?.trim()) {
    personaVoiceId = sample.legacyengineVoiceId.trim();
  }

  if (!personaVoiceId) {
    return null;
  }

  const available = await checkPersonaAvailableWithRetry(personaVoiceId);

  if (!available) {
    return null;
  }

  if (
    options.persistCorrection &&
    personaVoiceId !== sample.legacyengineVoiceId?.trim()
  ) {
    await persistPersonaVoiceId(sample.id, personaVoiceId);
  } else if (
    options.persistCorrection &&
    sample.voiceCloneStatus !== "ready"
  ) {
    await persistPersonaVoiceId(sample.id, personaVoiceId);
  }

  return personaVoiceId;
}

export function isReadyForMusicGeneration(
  sample: VoiceSample,
  personaVoiceId: string | null,
): boolean {
  return (
    sample.status === "ready" &&
    sample.consentConfirmed &&
    sample.voiceCloneStatus === "ready" &&
    personaVoiceId !== null
  );
}

export { PERSONA_VOICE_UNAVAILABLE_MESSAGE, checkPersonaAvailableWithRetry };

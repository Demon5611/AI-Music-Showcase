import type { GenerateSongInput } from "@ai-music/ai-providers";
import { createSunoVoiceClients, withSunoGenerationOptions } from "@ai-music/ai-providers";
import { stripPersonaConflictingStyleTags } from "@ai-music/shared";
import { ForbiddenError } from "../../common/errors.js";
import { PERSONA_VOICE_UNAVAILABLE_MESSAGE } from "../voice-samples/persona-voice-id.service.js";
import { resolveSunoVoicePersonaForUser } from "../voice-samples/resolve-suno-voice-persona.js";

export interface MusicGenerateLogger {
  info: (payload: Record<string, unknown>, message: string) => void;
  warn: (payload: Record<string, unknown>, message: string) => void;
}

async function assertSunoPersonaAvailable(
  persona: NonNullable<Awaited<ReturnType<typeof resolveSunoVoicePersonaForUser>>>,
  log?: MusicGenerateLogger,
): Promise<void> {
  const { voice } = createSunoVoiceClients();

  if (await voice.checkPersonaVoiceAvailability(persona.personaId)) {
    return;
  }

  log?.warn(
    {
      personaId: persona.personaId,
      sunoVoiceTaskId: persona.sunoVoiceTaskId,
    },
    "Suno voice_id check returned unavailable; blocking music generation",
  );

  throw new ForbiddenError(PERSONA_VOICE_UNAVAILABLE_MESSAGE);
}

export async function resolveMusicPersonaForUser(
  userId: string,
  voiceSampleId?: string,
  log?: MusicGenerateLogger,
) {
  const persona = await resolveSunoVoicePersonaForUser(userId, voiceSampleId);

  if (!persona) {
    if (voiceSampleId) {
      throw new ForbiddenError(
        "Голос не прошёл проверку AI Music. Пройдите верификацию заново — перезагрузка образца не нужна, если запись на главной сохранена.",
      );
    }

    return null;
  }

  await assertSunoPersonaAvailable(persona, log);

  log?.info(
    {
      userId,
      voiceSampleId: persona.voiceSampleId,
      personaId: persona.personaId,
      sunoVoiceTaskId: persona.sunoVoiceTaskId,
      personaModel: persona.personaModel,
    },
    "Resolved Suno Voice persona for music generation",
  );

  return persona;
}

export function buildPersonaSongInput(
  input: GenerateSongInput,
  persona: NonNullable<Awaited<ReturnType<typeof resolveSunoVoicePersonaForUser>>>,
): GenerateSongInput {
  const withPersona = withSunoGenerationOptions(input, {
    personaId: persona.personaId,
    personaModel: persona.personaModel,
    vocalGender: undefined,
  });

  // Explicitly drop vocalGender from merged options (patch undefined does not delete).
  const options = {
    ...(withPersona.providerOptions?.providerId === "sunoapi"
      ? withPersona.providerOptions.options
      : {}),
    personaId: persona.personaId,
    personaModel: persona.personaModel as "voice_persona" | "style_persona",
  };
  delete options.vocalGender;

  return {
    ...input,
    prompt: input.prompt.trim(),
    style: stripPersonaConflictingStyleTags(input.style),
    providerOptions: {
      providerId: "sunoapi",
      options,
    },
  };
}

import { config } from "dotenv";
import { resolve } from "node:path";
import { prisma } from "@ai-music/db";
import {
  resolvePersonaVoiceId,
  isReadyForMusicGeneration,
} from "../src/modules/voice-samples/persona-voice-id.service.js";
import { syncVoiceSampleListEntry } from "../src/modules/voice-samples/suno-voice.service.js";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const sampleId = process.argv[2];

async function main() {
  if (!sampleId) {
    console.error("Usage: pnpm exec tsx scripts/repair-voice-persona.ts <voiceSampleId>");
    process.exit(1);
  }

  let sample = await prisma.voiceSample.findUniqueOrThrow({
    where: { id: sampleId },
  });

  sample = await syncVoiceSampleListEntry(sample);

  const personaId = await resolvePersonaVoiceId(sample, {
    persistCorrection: true,
  });

  sample = await prisma.voiceSample.findUniqueOrThrow({
    where: { id: sampleId },
  });

  console.log(
    JSON.stringify(
      {
        id: sample.id,
        voiceCloneStatus: sample.voiceCloneStatus,
        sunoVoiceId: sample.sunoVoiceId,
        sunoVoiceTaskId: sample.sunoVoiceTaskId,
        voiceCloneError: sample.voiceCloneError,
        personaId,
        readyForMusicGeneration: isReadyForMusicGeneration(sample, personaId),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

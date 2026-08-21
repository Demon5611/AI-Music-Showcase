import { config } from "dotenv";
import { resolve } from "node:path";
import { prisma } from "@ai-music/db";
import { createSunoVoiceClients } from "@ai-music/ai-providers";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const generationId = process.argv[2] ?? "cmqmi15kz0003kshkfk90ssit";

async function main() {
  const gen = await prisma.musicGeneration.findUnique({
    where: { id: generationId },
    include: {
      tracks: true,
      user: { select: { vocalGender: true, id: true, email: true } },
    },
  });

  if (!gen) {
    console.error("Generation not found");
    process.exit(1);
  }

  const samples = await prisma.voiceSample.findMany({
    where: { userId: gen.userId },
    orderBy: { createdAt: "desc" },
  });

  const { voice } = createSunoVoiceClients();
  const personaChecks = await Promise.all(
    samples
      .filter((sample) => sample.sunoVoiceId || sample.sunoVoiceTaskId)
      .map(async (sample) => {
        const id = sample.sunoVoiceId?.trim() || sample.sunoVoiceTaskId!.trim();
        return {
          id: sample.id,
          sunoVoiceId: sample.sunoVoiceId,
          sunoVoiceTaskId: sample.sunoVoiceTaskId,
          voiceCloneStatus: sample.voiceCloneStatus,
          checkPersonaVoiceAvailability: await voice.checkPersonaVoiceAvailability(id),
        };
      }),
  );

  console.log(
    JSON.stringify(
      {
        generation: {
          id: gen.id,
          providerTaskId: gen.providerTaskId,
          style: gen.style,
          title: gen.title,
          customMode: gen.customMode,
          promptPreview: gen.prompt.slice(0, 120),
        },
        user: gen.user,
        voiceSamples: personaChecks,
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

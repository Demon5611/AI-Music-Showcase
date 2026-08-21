import { config } from "dotenv";
import { resolve } from "node:path";
import { createSunoVoiceClients } from "@ai-music/ai-providers";
import { prisma } from "@ai-music/db";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const sampleId = process.argv[2] ?? "cmqi5bz1h0001kslfmrxljz80";

async function main() {
  const sample = await prisma.voiceSample.findUnique({ where: { id: sampleId } });

  if (!sample?.sunoVoiceTaskId) {
    console.log(JSON.stringify({ error: "sample or task not found" }, null, 2));
    return;
  }

  const { voice } = createSunoVoiceClients();
  const taskId = sample.sunoVoiceTaskId;
  const [validate, record] = await Promise.all([
    voice.getValidationPhraseInfo(taskId),
    voice.getVoiceRecordInfo(taskId),
  ]);

  console.log(
    JSON.stringify(
      {
        sample: {
          voiceCloneStatus: sample.voiceCloneStatus,
          voiceCloneStartedAt: sample.voiceCloneStartedAt,
          sunoValidatePhrase: sample.sunoValidatePhrase,
          voiceCloneError: sample.voiceCloneError,
          durationSec: sample.durationSec,
        },
        validate,
        record,
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

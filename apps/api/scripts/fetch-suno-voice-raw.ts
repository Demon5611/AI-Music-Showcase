import { config } from "dotenv";
import { resolve } from "node:path";
import { createSunoVoiceClients, resolveMusicProviderConfig } from "@ai-music/ai-providers";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const taskId = process.argv[2];

async function fetchRaw(path: string): Promise<unknown> {
  const cfg = resolveMusicProviderConfig();
  const url = `${cfg.sunoApiBaseUrl.replace(/\/$/, "")}/api/v1${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.sunoApiKey}` },
  });

  return response.json();
}

async function main() {
  if (!taskId) {
    console.error("Usage: pnpm exec tsx scripts/fetch-suno-voice-raw.ts <taskId>");
    process.exit(1);
  }

  const { voice } = createSunoVoiceClients();
  const validateRaw = await fetchRaw(
    `/voice/validate-info?taskId=${encodeURIComponent(taskId)}`,
  );
  const recordRaw = await fetchRaw(
    `/voice/record-info?taskId=${encodeURIComponent(taskId)}`,
  );

  console.log(
    JSON.stringify(
      {
        validate: await voice.getValidationPhraseInfo(taskId),
        record: await voice.getVoiceRecordInfo(taskId),
        validateRaw,
        recordRaw,
        checkVoiceIdAvailability: await voice.checkVoiceIdAvailability(taskId),
        checkVoiceAvailability: await voice.checkVoiceAvailability(taskId),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

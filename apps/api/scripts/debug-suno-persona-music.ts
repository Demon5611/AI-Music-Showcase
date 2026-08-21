import { config } from "dotenv";
import { resolve } from "node:path";
import { createSunoApiProvider, createSunoVoiceClients, resolveMusicProviderConfig } from "@ai-music/ai-providers";
import { stripPersonaConflictingStyleTags } from "@ai-music/shared";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const musicTaskId = process.argv[2] ?? "7fbfcefd5c4bfe6d2c391e78a43f2a88";
const personaId = process.argv[3] ?? "75aae795c8e8b5f0ce426fd0d5fd94d3";
const style =
  process.argv[4] ??
  "electropop, energetic, anthemic vocal, bright synths";

async function fetchRaw(path: string): Promise<unknown> {
  const cfg = resolveMusicProviderConfig();
  const url = `${cfg.sunoApiBaseUrl.replace(/\/$/, "")}/api/v1${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${cfg.sunoApiKey}` },
  });
  return response.json();
}

async function main() {
  const { voice } = createSunoVoiceClients();
  const provider = createSunoApiProvider();

  const voiceRecord = await voice.getVoiceRecordInfo(personaId);
  const voiceRecordRaw = await fetchRaw(
    `/voice/record-info?taskId=${encodeURIComponent(personaId)}`,
  );
  const musicRecordRaw = await fetchRaw(
    `/generate/record-info?taskId=${encodeURIComponent(musicTaskId)}`,
  );

  const strippedStyle = stripPersonaConflictingStyleTags(style);

  console.log(
    JSON.stringify(
      {
        personaId,
        voiceRecord,
        voiceRecordRaw,
        checkVoiceIdAvailability: await voice.checkVoiceIdAvailability(personaId),
        checkVoiceAvailability: await voice.checkVoiceAvailability(personaId),
        checkPersonaVoiceAvailability: await voice.checkPersonaVoiceAvailability(personaId),
        styleOriginal: style,
        styleStripped: strippedStyle,
        musicRecordRaw,
        musicStatus: await provider.getGenerationStatus(musicTaskId),
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

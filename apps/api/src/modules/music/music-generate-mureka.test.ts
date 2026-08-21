/**
 * Mureka generate helpers.
 * Run: `pnpm --filter @ai-music/api exec tsx src/modules/music/music-generate-mureka.test.ts`
 */
import assert from "node:assert/strict";
import {
  getMurekaGenerationOptions,
  toPersistedSongInput,
} from "@ai-music/ai-providers";
import {
  MUREKA_PROVIDER_JOB_QUEUE_NAME,
  MUREKA_OUTPUT_COUNT,
  resolveMusicGenerateCostUnits,
  resolveMurekaFeatureFlags,
} from "@ai-music/shared";
import {
  buildMurekaSongInput,
  buildMurekaSongInputWithoutVoice,
  murekaSpendAmountUnits,
} from "./music-generate-mureka.js";

function toMusicGenerateResponse(record: {
  id: string;
  status: string;
  provider: string;
}) {
  return {
    recordId: record.id,
    provider: record.provider === "mureka" ? "mureka" : "sunoapi",
    taskId: record.id,
    status: record.status,
  };
}

function run() {
  const songInput = buildMurekaSongInput({
    base: {
      prompt: "verse one",
      style: "ignored",
      title: "Title",
      mode: "song",
      durationSec: 60,
      providerOptions: {
        providerId: "mureka",
        options: { voiceProfileId: "vp-db-id" },
      },
    },
    vocalId: "mureka-external-vocal",
    voiceProfileId: "vp-db-id",
    musicBrief: { additionalInstructions: "dreamy pop" },
  });

  const options = getMurekaGenerationOptions(songInput);
  assert.equal(options?.voiceProfileId, "vp-db-id");
  assert.equal(options?.vocalId, "mureka-external-vocal");
  assert.equal(options?.musicPrompt, "additional: dreamy pop");
  assert.equal(songInput.providerOptions?.providerId, "mureka");
  assert.equal(options?.n, 1);
  assert.equal(options?.n, MUREKA_OUTPUT_COUNT);
  assert.equal(options?.n, resolveMurekaFeatureFlags().songCount);

  // Stale options.n must not leak into prepared product invariant.
  const staleN = buildMurekaSongInput({
    base: {
      prompt: "verse",
      style: "pop",
      title: "T",
      mode: "song",
      durationSec: 60,
      providerOptions: { providerId: "mureka", options: { n: 3 } },
    },
    vocalId: "vocal-1",
    voiceProfileId: "vp-1",
    musicBrief: { additionalInstructions: "pop" },
  });
  assert.equal(getMurekaGenerationOptions(staleN)?.n, 1);

  const persisted = toPersistedSongInput(songInput);
  assert.equal(persisted.providerId, "mureka");
  assert.equal(persisted.voiceProfileId, "vp-db-id");
  assert.equal(persisted.vocalId, "mureka-external-vocal");

  assert.equal(murekaSpendAmountUnits(), resolveMusicGenerateCostUnits({ providerId: "mureka" }));
  assert.equal(murekaSpendAmountUnits(), 24_000);

  const withoutVoice = buildMurekaSongInputWithoutVoice({
    base: {
      prompt: "verse",
      style: "pop",
      title: "T",
      mode: "song",
      durationSec: 60,
      providerOptions: { providerId: "mureka", options: {} },
    },
    musicBrief: { additionalInstructions: "pop" },
  });
  const withoutOpts = getMurekaGenerationOptions(withoutVoice);
  assert.equal(withoutVoice.providerOptions?.providerId, "mureka");
  assert.equal(withoutOpts?.vocalId, undefined);
  assert.equal(withoutOpts?.voiceProfileId, undefined);
  assert.equal(withoutOpts?.musicPrompt, "additional: pop");
  assert.equal(withoutOpts?.n, 1);

  const response = toMusicGenerateResponse({
    id: "gen1",
    status: "pending",
    provider: "mureka",
  });
  assert.equal(response.provider, "mureka");
  assert.equal("vocalId" in response, false);
  assert.equal("vocal_id" in response, false);
  assert.equal(JSON.stringify(response).includes("mureka-external-vocal"), false);

  assert.equal(MUREKA_PROVIDER_JOB_QUEUE_NAME, "mureka-provider-jobs");

  console.log("music-generate-mureka tests passed");
}

run();

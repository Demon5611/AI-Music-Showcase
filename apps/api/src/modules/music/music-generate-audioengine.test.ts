/**
 * Audioengine generate helpers.
 * Run: `pnpm --filter @ai-music/api exec tsx src/modules/music/music-generate-audioengine.test.ts`
 */
import assert from "node:assert/strict";
import {
  getAudioengineGenerationOptions,
  toPersistedSongInput,
} from "@ai-music/ai-providers";
import {
  AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME,
  AUDIOENGINE_OUTPUT_COUNT,
  resolveMusicGenerateCostUnits,
  resolveAudioengineFeatureFlags,
} from "@ai-music/shared";
import {
  buildAudioengineSongInput,
  buildAudioengineSongInputWithoutVoice,
  audioengineSpendAmountUnits,
} from "./music-generate-audioengine.js";

function toMusicGenerateResponse(record: {
  id: string;
  status: string;
  provider: string;
}) {
  return {
    recordId: record.id,
    provider: record.provider === "audioengine" ? "audioengine" : "legacyengineapi",
    taskId: record.id,
    status: record.status,
  };
}

function run() {
  const songInput = buildAudioengineSongInput({
    base: {
      prompt: "verse one",
      style: "ignored",
      title: "Title",
      mode: "song",
      durationSec: 60,
      providerOptions: {
        providerId: "audioengine",
        options: { voiceProfileId: "vp-db-id" },
      },
    },
    vocalId: "audioengine-external-vocal",
    voiceProfileId: "vp-db-id",
    musicBrief: { additionalInstructions: "dreamy pop" },
  });

  const options = getAudioengineGenerationOptions(songInput);
  assert.equal(options?.voiceProfileId, "vp-db-id");
  assert.equal(options?.vocalId, "audioengine-external-vocal");
  assert.equal(options?.musicPrompt, "additional: dreamy pop");
  assert.equal(songInput.providerOptions?.providerId, "audioengine");
  assert.equal(options?.n, 1);
  assert.equal(options?.n, AUDIOENGINE_OUTPUT_COUNT);
  assert.equal(options?.n, resolveAudioengineFeatureFlags().songCount);

  // Stale options.n must not leak into prepared product invariant.
  const staleN = buildAudioengineSongInput({
    base: {
      prompt: "verse",
      style: "pop",
      title: "T",
      mode: "song",
      durationSec: 60,
      providerOptions: { providerId: "audioengine", options: { n: 3 } },
    },
    vocalId: "vocal-1",
    voiceProfileId: "vp-1",
    musicBrief: { additionalInstructions: "pop" },
  });
  assert.equal(getAudioengineGenerationOptions(staleN)?.n, 1);

  const persisted = toPersistedSongInput(songInput);
  assert.equal(persisted.providerId, "audioengine");
  assert.equal(persisted.voiceProfileId, "vp-db-id");
  assert.equal(persisted.vocalId, "audioengine-external-vocal");

  assert.equal(audioengineSpendAmountUnits(), resolveMusicGenerateCostUnits({ providerId: "audioengine" }));
  assert.equal(audioengineSpendAmountUnits(), 24_000);

  const withoutVoice = buildAudioengineSongInputWithoutVoice({
    base: {
      prompt: "verse",
      style: "pop",
      title: "T",
      mode: "song",
      durationSec: 60,
      providerOptions: { providerId: "audioengine", options: {} },
    },
    musicBrief: { additionalInstructions: "pop" },
  });
  const withoutOpts = getAudioengineGenerationOptions(withoutVoice);
  assert.equal(withoutVoice.providerOptions?.providerId, "audioengine");
  assert.equal(withoutOpts?.vocalId, undefined);
  assert.equal(withoutOpts?.voiceProfileId, undefined);
  assert.equal(withoutOpts?.musicPrompt, "additional: pop");
  assert.equal(withoutOpts?.n, 1);

  const response = toMusicGenerateResponse({
    id: "gen1",
    status: "pending",
    provider: "audioengine",
  });
  assert.equal(response.provider, "audioengine");
  assert.equal("vocalId" in response, false);
  assert.equal("vocal_id" in response, false);
  assert.equal(JSON.stringify(response).includes("audioengine-external-vocal"), false);

  assert.equal(AUDIOENGINE_PROVIDER_JOB_QUEUE_NAME, "audioengine-provider-jobs");

  console.log("music-generate-audioengine tests passed");
}

run();

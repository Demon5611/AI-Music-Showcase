/**
 * Audioengine generate payload explicitly sends output count `n: 1` (product invariant).
 * Audioengine API default without `n` is 2 — never omit the field.
 * Run: pnpm --filter @ai-music/ai-providers exec tsx src/music/providers/audioengine/audioengine-music-generation.provider.test.ts
 */
import assert from "node:assert/strict";
import { AUDIOENGINE_OUTPUT_COUNT, resolveAudioengineFeatureFlags } from "@ai-music/shared";
import { AudioengineMusicGenerationProvider } from "./audioengine-music-generation.provider.js";
import type { AudioengineClient } from "./audioengine-client.js";
import type { AudioengineClientConfig } from "./audioengine-config.js";
import { audioengineGenerateSongRequestSchema } from "./audioengine-types.js";

function config(songCount: number): AudioengineClientConfig {
  return {
    apiKey: "test",
    baseUrl: "https://integration.example.invalid",
    model: "audioengine-9",
    songCount,
    requestTimeoutMs: 30_000,
    pollTimeoutMs: 600_000,
    flags: resolveAudioengineFeatureFlags({ AUDIOENGINE_SONG_COUNT: String(songCount) }),
  };
}

function mockClient(songCount: number): AudioengineClient {
  return {
    getConfig: () => config(songCount),
  } as unknown as AudioengineClient;
}

const provider = new AudioengineMusicGenerationProvider(mockClient(1));
const prepared = provider.prepareGeneration(
  {
    prompt: "hello lyrics",
    style: "dreamy pop",
    providerOptions: { providerId: "audioengine", options: {} },
  },
  { recordId: "gen-1", userId: "user-1" },
);

assert.equal(prepared.providerId, "audioengine");
assert.equal(prepared.payload.body.n, AUDIOENGINE_OUTPUT_COUNT);
assert.equal(prepared.payload.body.n, 1);
assert.equal(prepared.payload.body.model, "audioengine-9");
assert.equal(prepared.payload.body.lyrics, "hello lyrics");
assert.equal(prepared.payload.body.prompt, "dreamy pop");
assert.equal("vocal_id" in prepared.payload.body, false);

assert.equal(audioengineGenerateSongRequestSchema.parse(prepared.payload.body).n, 1);
assert.equal(audioengineGenerateSongRequestSchema.safeParse({ ...prepared.payload.body, n: 0 }).success, false);
assert.equal(audioengineGenerateSongRequestSchema.safeParse({ ...prepared.payload.body, n: 2 }).success, false);
assert.equal(audioengineGenerateSongRequestSchema.safeParse({ ...prepared.payload.body, n: 3 }).success, false);
assert.equal(audioengineGenerateSongRequestSchema.safeParse({ ...prepared.payload.body, n: 4 }).success, false);
assert.equal(audioengineGenerateSongRequestSchema.safeParse({ ...prepared.payload.body, n: 1.5 }).success, false);
assert.equal(audioengineGenerateSongRequestSchema.safeParse({ ...prepared.payload.body, n: -1 }).success, false);

// Client options.n must not override product invariant.
const withExplicitN = new AudioengineMusicGenerationProvider(mockClient(1)).prepareGeneration(
  {
    prompt: "lyrics",
    style: "pop",
    providerOptions: { providerId: "audioengine", options: { n: 3 } },
  },
  { recordId: "gen-2", userId: "user-1" },
);
assert.equal(withExplicitN.payload.body.n, 1);

// Missing / legacy AUDIOENGINE_SONG_COUNT=2 config still sends n=1.
const missingEnvFlags = resolveAudioengineFeatureFlags({});
assert.equal(missingEnvFlags.songCount, 1);
const fromLegacyEnv = new AudioengineMusicGenerationProvider(mockClient(2)).prepareGeneration(
  {
    prompt: "lyrics",
    style: "pop",
    providerOptions: { providerId: "audioengine", options: {} },
  },
  { recordId: "gen-3", userId: "user-1" },
);
assert.equal(fromLegacyEnv.payload.body.n, 1);

// Cloned voice: vocal_id + n=1.
const withVocal = new AudioengineMusicGenerationProvider(mockClient(1)).prepareGeneration(
  {
    prompt: "lyrics with voice",
    style: "soul",
    providerOptions: {
      providerId: "audioengine",
      options: { vocalId: "vocal-abc", n: 2 },
    },
  },
  { recordId: "gen-4", userId: "user-1" },
);
assert.equal(withVocal.payload.body.n, 1);
assert.equal(withVocal.payload.body.vocal_id, "vocal-abc");

// Retry/resume: persisted options with n=2 must still prepare n=1.
const retryPrepared = new AudioengineMusicGenerationProvider(mockClient(2)).prepareGeneration(
  {
    prompt: "retry lyrics",
    style: "retry style",
    providerOptions: {
      providerId: "audioengine",
      options: { vocalId: "vocal-retry", n: 2, model: "audioengine-9" },
    },
  },
  { recordId: "gen-retry", userId: "user-1" },
);
assert.equal(retryPrepared.payload.body.n, 1);
assert.equal(retryPrepared.payload.body.vocal_id, "vocal-retry");

console.log("audioengine-music-generation.provider.test.ts: ok");

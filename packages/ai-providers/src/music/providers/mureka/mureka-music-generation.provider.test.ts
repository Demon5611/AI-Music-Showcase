/**
 * Mureka generate payload explicitly sends output count `n: 1` (product invariant).
 * Mureka API default without `n` is 2 — never omit the field.
 * Run: pnpm --filter @ai-music/ai-providers exec tsx src/music/providers/mureka/mureka-music-generation.provider.test.ts
 */
import assert from "node:assert/strict";
import { MUREKA_OUTPUT_COUNT, resolveMurekaFeatureFlags } from "@ai-music/shared";
import { MurekaMusicGenerationProvider } from "./mureka-music-generation.provider.js";
import type { MurekaClient } from "./mureka-client.js";
import type { MurekaClientConfig } from "./mureka-config.js";
import { murekaGenerateSongRequestSchema } from "./mureka-types.js";

function config(songCount: number): MurekaClientConfig {
  return {
    apiKey: "test",
    baseUrl: "https://api.mureka.ai",
    model: "mureka-9",
    songCount,
    requestTimeoutMs: 30_000,
    pollTimeoutMs: 600_000,
    flags: resolveMurekaFeatureFlags({ MUREKA_SONG_COUNT: String(songCount) }),
  };
}

function mockClient(songCount: number): MurekaClient {
  return {
    getConfig: () => config(songCount),
  } as unknown as MurekaClient;
}

const provider = new MurekaMusicGenerationProvider(mockClient(1));
const prepared = provider.prepareGeneration(
  {
    prompt: "hello lyrics",
    style: "dreamy pop",
    providerOptions: { providerId: "mureka", options: {} },
  },
  { recordId: "gen-1", userId: "user-1" },
);

assert.equal(prepared.providerId, "mureka");
assert.equal(prepared.payload.body.n, MUREKA_OUTPUT_COUNT);
assert.equal(prepared.payload.body.n, 1);
assert.equal(prepared.payload.body.model, "mureka-9");
assert.equal(prepared.payload.body.lyrics, "hello lyrics");
assert.equal(prepared.payload.body.prompt, "dreamy pop");
assert.equal("vocal_id" in prepared.payload.body, false);

assert.equal(murekaGenerateSongRequestSchema.parse(prepared.payload.body).n, 1);
assert.equal(murekaGenerateSongRequestSchema.safeParse({ ...prepared.payload.body, n: 0 }).success, false);
assert.equal(murekaGenerateSongRequestSchema.safeParse({ ...prepared.payload.body, n: 2 }).success, false);
assert.equal(murekaGenerateSongRequestSchema.safeParse({ ...prepared.payload.body, n: 3 }).success, false);
assert.equal(murekaGenerateSongRequestSchema.safeParse({ ...prepared.payload.body, n: 4 }).success, false);
assert.equal(murekaGenerateSongRequestSchema.safeParse({ ...prepared.payload.body, n: 1.5 }).success, false);
assert.equal(murekaGenerateSongRequestSchema.safeParse({ ...prepared.payload.body, n: -1 }).success, false);

// Client options.n must not override product invariant.
const withExplicitN = new MurekaMusicGenerationProvider(mockClient(1)).prepareGeneration(
  {
    prompt: "lyrics",
    style: "pop",
    providerOptions: { providerId: "mureka", options: { n: 3 } },
  },
  { recordId: "gen-2", userId: "user-1" },
);
assert.equal(withExplicitN.payload.body.n, 1);

// Missing / legacy MUREKA_SONG_COUNT=2 config still sends n=1.
const missingEnvFlags = resolveMurekaFeatureFlags({});
assert.equal(missingEnvFlags.songCount, 1);
const fromLegacyEnv = new MurekaMusicGenerationProvider(mockClient(2)).prepareGeneration(
  {
    prompt: "lyrics",
    style: "pop",
    providerOptions: { providerId: "mureka", options: {} },
  },
  { recordId: "gen-3", userId: "user-1" },
);
assert.equal(fromLegacyEnv.payload.body.n, 1);

// Cloned voice: vocal_id + n=1.
const withVocal = new MurekaMusicGenerationProvider(mockClient(1)).prepareGeneration(
  {
    prompt: "lyrics with voice",
    style: "soul",
    providerOptions: {
      providerId: "mureka",
      options: { vocalId: "vocal-abc", n: 2 },
    },
  },
  { recordId: "gen-4", userId: "user-1" },
);
assert.equal(withVocal.payload.body.n, 1);
assert.equal(withVocal.payload.body.vocal_id, "vocal-abc");

// Retry/resume: persisted options with n=2 must still prepare n=1.
const retryPrepared = new MurekaMusicGenerationProvider(mockClient(2)).prepareGeneration(
  {
    prompt: "retry lyrics",
    style: "retry style",
    providerOptions: {
      providerId: "mureka",
      options: { vocalId: "vocal-retry", n: 2, model: "mureka-9" },
    },
  },
  { recordId: "gen-retry", userId: "user-1" },
);
assert.equal(retryPrepared.payload.body.n, 1);
assert.equal(retryPrepared.payload.body.vocal_id, "vocal-retry");

console.log("mureka-music-generation.provider.test.ts: ok");

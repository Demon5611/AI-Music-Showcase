/**
 * PR8.3 generate body adapter + persist mappers.
 * Run: `pnpm --filter @ai-music/api exec tsx src/modules/music/music-generate-body.test.ts`
 */
import assert from "node:assert/strict";
import {
  createSunoApiProvider,
  fromPersistedSongInput,
  toPersistedSongInput,
  type GenerateSongInput,
} from "@ai-music/ai-providers";
import { musicGenerateBodySchema } from "@ai-music/shared";
import { isAppError } from "../../common/errors.js";
import { normalizeMusicGenerateBody } from "./music-generate-body.js";
import { buildPersonaSongInput } from "./music-persona.js";

function assertConflict(body: unknown): void {
  const parsed = musicGenerateBodySchema.safeParse(body);
  assert.equal(parsed.success, true, "schema should accept body before conflict check");
  if (!parsed.success) {
    return;
  }

  let threw = false;
  try {
    normalizeMusicGenerateBody(parsed.data);
  } catch (error) {
    threw = true;
    assert.equal(isAppError(error) && error.statusCode === 400, true, "conflict → 400");
  }
  assert.equal(threw, true, "expected conflict");
}

function run() {
  const legacyParsed = musicGenerateBodySchema.parse({
    prompt: "lyrics here",
    style: "Pop",
    title: "Song",
    customMode: true,
    instrumental: false,
    durationSec: 60,
    voiceSampleId: "vs1",
  });
  const legacy = normalizeMusicGenerateBody(legacyParsed);
  assert.equal(legacy.voiceSampleId, "vs1");
  assert.equal(legacy.input.mode, "song");
  assert.equal(legacy.input.lyricsLanguage, "auto");
  assert.equal(legacy.input.providerOptions?.providerId, "sunoapi");
  if (legacy.input.providerOptions?.providerId === "sunoapi") {
    assert.equal(legacy.input.providerOptions.options.customMode, true);
  }

  const withLanguage = normalizeMusicGenerateBody(
    musicGenerateBodySchema.parse({
      prompt: "lyrics here",
      lyricsLanguage: "ka",
    }),
  );
  assert.equal(withLanguage.input.lyricsLanguage, "ka");
  assert.equal(toPersistedSongInput(withLanguage.input).lyricsLanguage, "ka");

  const multiRejected = musicGenerateBodySchema.safeParse({
    prompt: "x",
    lyricsLanguage: "multi",
  });
  assert.equal(multiRejected.success, false, "public schema rejects multi");

  const newParsed = musicGenerateBodySchema.parse({
    prompt: "lyrics here",
    style: "Pop",
    title: "Song",
    durationSec: 60,
    mode: "song",
    providerOptions: {
      providerId: "sunoapi",
      options: { customMode: true },
    },
  });
  const modern = normalizeMusicGenerateBody(newParsed);
  const modernPersisted = toPersistedSongInput(modern.input);
  const legacyPersisted = toPersistedSongInput(legacy.input);
  assert.equal(modernPersisted.prompt, legacyPersisted.prompt);
  assert.equal(modernPersisted.style, legacyPersisted.style);
  assert.equal(modernPersisted.customMode, legacyPersisted.customMode);
  assert.equal(modernPersisted.providerId, "sunoapi");
  assert.equal(legacyPersisted.providerId, "sunoapi");

  assertConflict({
    prompt: "x",
    instrumental: true,
    mode: "song",
  });
  assertConflict({
    prompt: "x",
    customMode: true,
    providerOptions: {
      providerId: "sunoapi",
      options: { customMode: false },
    },
  });
  assertConflict({
    prompt: "x",
    customMode: true,
    providerOptions: { providerId: "mock" },
  });

  const mockOnly = normalizeMusicGenerateBody(
    musicGenerateBodySchema.parse({
      prompt: "mock",
      providerOptions: { providerId: "mock" },
    }),
  );
  assert.equal(mockOnly.input.providerOptions?.providerId, "mock");

  let sunoRejectedMock = false;
  try {
    createSunoApiProvider().prepareMusicGenerate(mockOnly.input);
  } catch {
    sunoRejectedMock = true;
  }
  assert.equal(sunoRejectedMock, true, "Suno provider rejects mock options");

  const flatLegacy = {
    prompt: "old",
    style: "Jazz",
    title: "T",
    customMode: true,
    instrumental: false,
    durationSec: 45,
    personaId: "persona-1",
    personaModel: "voice_persona" as const,
  };
  const restored = fromPersistedSongInput(flatLegacy);
  assert.equal(restored.providerOptions?.providerId, "sunoapi");
  assert.deepEqual(toPersistedSongInput(restored), {
    prompt: "old",
    style: "Jazz",
    title: "T",
    durationSec: 45,
    instrumental: false,
    customMode: true,
    referenceAudioUrl: undefined,
    personaId: "persona-1",
    personaModel: "voice_persona",
    vocalGender: undefined,
    providerId: "sunoapi",
    vocalId: undefined,
    voiceProfileId: undefined,
    musicPrompt: undefined,
    model: undefined,
    n: undefined,
  });

  const personaInput = buildPersonaSongInput(
    {
      prompt: "  hello  ",
      style: "Pop, female vocal",
      title: "A",
      mode: "song",
      durationSec: 60,
      providerOptions: {
        providerId: "sunoapi",
        options: { customMode: true, vocalGender: "m" },
      },
    },
    {
      voiceSampleId: "vs",
      personaId: "p1",
      sunoVoiceTaskId: "task",
      personaModel: "voice_persona",
    },
  );
  assert.equal(personaInput.prompt, "hello");
  if (personaInput.providerOptions?.providerId === "sunoapi") {
    assert.equal(personaInput.providerOptions.options.personaId, "p1");
    assert.equal(personaInput.providerOptions.options.vocalGender, undefined);
  }

  const withPersona: GenerateSongInput = personaInput;
  const prepared = createSunoApiProvider().prepareMusicGenerate(withPersona);
  assert.equal(prepared.path, "/generate");
  assert.equal(
    (prepared.body as { personaId?: string; vocalGender?: string }).personaId,
    "p1",
  );
  assert.equal(
    (prepared.body as { vocalGender?: string }).vocalGender,
    undefined,
  );

  const murekaPersonal = normalizeMusicGenerateBody(
    musicGenerateBodySchema.parse({
      prompt: "mureka lyrics",
      style: "pop",
      title: "M",
      durationSec: 60,
      voiceProfileId: "vp1",
      usePersonalVoice: true,
      musicBrief: { additionalInstructions: "pop" },
      providerOptions: {
        providerId: "mureka",
        options: { voiceProfileId: "vp1" },
      },
    }),
  );
  assert.equal(murekaPersonal.input.providerOptions?.providerId, "mureka");
  assert.equal(murekaPersonal.voiceProfileId, "vp1");
  assert.equal(murekaPersonal.usePersonalVoice, true);
  if (murekaPersonal.input.providerOptions?.providerId === "mureka") {
    assert.equal(murekaPersonal.input.providerOptions.options.vocalId, undefined);
    assert.equal(murekaPersonal.input.providerOptions.options.voiceProfileId, "vp1");
    assert.equal(
      "personaId" in murekaPersonal.input.providerOptions.options,
      false,
    );
  }

  assertConflict({
    prompt: "x",
    usePersonalVoice: true,
    voiceProfileId: "vp1",
    customMode: true,
  });
  assertConflict({
    prompt: "x",
    usePersonalVoice: true,
    voiceProfileId: "vp1",
    providerOptions: {
      providerId: "mureka",
      options: { vocalId: "client-vocal", voiceProfileId: "vp1" },
    },
  });
  assertConflict({
    prompt: "x",
    usePersonalVoice: true,
    voiceSampleId: "vs1",
  });

  // Personal voice OFF + explicit Mureka → remapped to Suno (ready profile alone ≠ Mureka).
  const offExplicitMureka = normalizeMusicGenerateBody(
    musicGenerateBodySchema.parse({
      prompt: "standard vocals",
      style: "pop",
      title: "S",
      durationSec: 60,
      usePersonalVoice: false,
      musicBrief: { additionalInstructions: "pop" },
      providerOptions: {
        providerId: "mureka",
        options: {},
      },
    }),
  );
  assert.equal(offExplicitMureka.usePersonalVoice, false);
  assert.equal(offExplicitMureka.voiceProfileId, undefined);
  assert.equal(offExplicitMureka.input.providerOptions?.providerId, "sunoapi");

  // Ready profile id in body without usePersonalVoice → no Mureka / no voiceProfileId.
  const readyProfileOff = normalizeMusicGenerateBody(
    musicGenerateBodySchema.parse({
      prompt: "off with profile id",
      customMode: true,
      instrumental: false,
      voiceProfileId: "vp-ready",
      usePersonalVoice: false,
    }),
  );
  assert.equal(readyProfileOff.usePersonalVoice, false);
  assert.equal(readyProfileOff.voiceProfileId, undefined);
  assert.equal(readyProfileOff.input.providerOptions?.providerId, "sunoapi");

  console.log("music-generate-body / persist / persona tests passed");
}

run();

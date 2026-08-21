import type { GenerateSongInput } from "@ai-music/ai-providers";
import {
  buildCanonicalMusicGenerateRequest,
  CANONICAL_REQUEST_VERSION,
  hashCanonicalRequest,
  parseOptionalIdempotencyKey,
} from "./music-generate-idempotency.js";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function baseInput(overrides: Partial<GenerateSongInput> = {}): GenerateSongInput {
  const base: GenerateSongInput = {
    prompt: "hello world",
    style: "pop, energetic",
    title: "Track",
    mode: "song",
    durationSec: 60,
    providerOptions: {
      providerId: "sunoapi",
      options: {
        customMode: true,
        vocalGender: "m",
      },
    },
  };

  if (!overrides.providerOptions) {
    return { ...base, ...overrides };
  }

  return {
    ...base,
    ...overrides,
    providerOptions: overrides.providerOptions,
  };
}

function withSunoPatch(
  patch: Partial<NonNullable<Extract<GenerateSongInput["providerOptions"], { providerId: "sunoapi" }>["options"]>>,
): GenerateSongInput {
  return baseInput({
    providerOptions: {
      providerId: "sunoapi",
      options: {
        customMode: true,
        vocalGender: "m",
        ...patch,
      },
    },
  });
}

function hashOf(input: GenerateSongInput, voiceSampleId?: string): string {
  return hashCanonicalRequest(buildCanonicalMusicGenerateRequest(input, { voiceSampleId }));
}

function runCanonicalRequestChecks(): void {
  const canonical = buildCanonicalMusicGenerateRequest(baseInput(), { voiceSampleId: "vs1" });
  assert(canonical.version === CANONICAL_REQUEST_VERSION, "canonical is versioned");

  assert(hashOf(baseInput()) === hashOf(baseInput()), "same body -> same hash");

  const h1 = hashOf(baseInput());
  const h2 = hashOf(baseInput());
  assert(h1 === h2, "hash is stable / no dynamic data");

  assert(
    hashOf(baseInput({ prompt: "  hello world  " })) === hashOf(baseInput({ prompt: "hello world" })),
    "prompt is trimmed before hashing",
  );
  assert(
    hashOf(baseInput({ style: "   " })) === hashOf(baseInput({ style: undefined })),
    "blank style normalized to null",
  );

  assert(hashOf(baseInput()) !== hashOf(baseInput({ prompt: "other" })), "prompt affects hash");
  assert(hashOf(baseInput()) !== hashOf(baseInput({ style: "rock" })), "style affects hash");
  assert(hashOf(baseInput()) !== hashOf(baseInput({ title: "Other" })), "title affects hash");
  assert(
    hashOf(baseInput()) !== hashOf(baseInput({ mode: "instrumental" })),
    "instrumental/mode affects hash",
  );
  assert(
    hashOf(baseInput()) !== hashOf(withSunoPatch({ customMode: false })),
    "customMode affects hash",
  );
  assert(
    hashOf(baseInput()) !== hashOf(baseInput({ durationSec: 90 })),
    "durationSec affects hash",
  );
  assert(
    hashOf(baseInput()) !== hashOf(withSunoPatch({ vocalGender: "f" })),
    "vocalGender affects hash",
  );
  assert(
    hashOf(baseInput(), "vsA") !== hashOf(baseInput(), "vsB"),
    "voiceSampleId affects hash",
  );
  assert(
    hashOf(baseInput({ lyricsLanguage: "auto" })) !==
      hashOf(baseInput({ lyricsLanguage: "ka" })),
    "lyricsLanguage affects hash",
  );
  assert(
    hashOf(baseInput()) === hashOf(baseInput({ lyricsLanguage: undefined })),
    "missing lyricsLanguage normalizes to auto",
  );

  assert(
    canonical.version === CANONICAL_REQUEST_VERSION && typeof canonical.version === "number",
    "version present in canonical",
  );
  assert(canonical.version === 4, "canonical version is 4 (no raw vocalId)");
  assert(canonical.vocalId === null, "canonical never stores provider vocal_id");

  const withVoiceProfile = baseInput({
    providerOptions: {
      providerId: "mureka",
      options: {
        voiceProfileId: "vp1",
        vocalId: "secret-vocal-a",
        musicPrompt: "pop",
        n: 2,
      },
    },
  });
  const withOtherVocal = baseInput({
    providerOptions: {
      providerId: "mureka",
      options: {
        voiceProfileId: "vp1",
        vocalId: "secret-vocal-b",
        musicPrompt: "pop",
        n: 2,
      },
    },
  });
  assert(
    hashOf(withVoiceProfile) === hashOf(withOtherVocal),
    "provider vocal_id does not affect idempotency hash",
  );
  assert(
    hashCanonicalRequest(buildCanonicalMusicGenerateRequest(withVoiceProfile, { voiceProfileId: "vp1" })) !==
      hashCanonicalRequest(
        buildCanonicalMusicGenerateRequest(withVoiceProfile, { voiceProfileId: "vp2" }),
      ),
    "voiceProfileId affects hash",
  );
}

function runIdempotencyKeyChecks(): void {
  const uuid = "3f1d2c4a-5b6e-4d7f-8a9b-0c1d2e3f4a5b";
  assert(parseOptionalIdempotencyKey(uuid) === uuid, "valid uuid accepted");
  assert(parseOptionalIdempotencyKey("  ") === undefined, "blank -> undefined");
  assert(parseOptionalIdempotencyKey(undefined) === undefined, "missing -> undefined");
  assert(parseOptionalIdempotencyKey([uuid]) === uuid, "array header -> first value");

  let threw = false;
  try {
    parseOptionalIdempotencyKey("not-a-uuid");
  } catch {
    threw = true;
  }
  assert(threw, "invalid key rejected");
}

runCanonicalRequestChecks();
runIdempotencyKeyChecks();

console.log("music-generate-idempotency tests passed");

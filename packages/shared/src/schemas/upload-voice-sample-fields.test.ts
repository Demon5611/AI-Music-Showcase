import assert from "node:assert/strict";
import { VOICE_CONSENT_PHRASES } from "../voice-language/voice-language.js";
import { uploadVoiceSampleFieldsSchema } from "./index.js";

assert.deepEqual(
  uploadVoiceSampleFieldsSchema.parse({
    confirmed: true,
    voiceLanguage: "en",
    consentPhrase: VOICE_CONSENT_PHRASES.en,
    durationSec: 20,
  }),
  {
    confirmed: true,
    voiceLanguage: "en",
    consentPhrase: VOICE_CONSENT_PHRASES.en,
    durationSec: 20,
  },
);

assert.equal(
  uploadVoiceSampleFieldsSchema.safeParse({
    confirmed: true,
    voiceLanguage: "en",
    consentPhrase: VOICE_CONSENT_PHRASES.ru,
    durationSec: 20,
  }).success,
  false,
);

assert.equal(
  uploadVoiceSampleFieldsSchema.safeParse({
    confirmed: true,
    voiceLanguage: "ru",
    consentPhrase: VOICE_CONSENT_PHRASES.ru,
    durationSec: 20,
  }).success,
  true,
);

assert.equal(
  uploadVoiceSampleFieldsSchema.safeParse({
    confirmed: true,
    voiceLanguage: "zh",
    consentPhrase: VOICE_CONSENT_PHRASES.zh,
    durationSec: 20,
  }).success,
  true,
);

assert.equal(
  uploadVoiceSampleFieldsSchema.safeParse({
    confirmed: true,
    voiceLanguage: "it",
    consentPhrase: VOICE_CONSENT_PHRASES.en,
    durationSec: 20,
  }).success,
  false,
);

console.log("upload-voice-sample-fields.test.ts: ok");

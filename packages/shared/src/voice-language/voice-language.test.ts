import assert from "node:assert/strict";
import {
  DEFAULT_VOICE_LANGUAGE,
  VOICE_CONSENT_PHRASES,
  VOICE_LANGUAGE_VALUES,
  getVoiceConsentPhrase,
  isVoiceConsentPhraseForLanguage,
  normalizeVoiceLanguage,
  resolveVoiceLanguageFromUiLocale,
  voiceLanguageSchema,
} from "./voice-language.js";

assert.equal(voiceLanguageSchema.parse("en"), "en");
assert.equal(voiceLanguageSchema.parse("ru"), "ru");
assert.equal(voiceLanguageSchema.parse("zh"), "zh");
assert.throws(() => voiceLanguageSchema.parse("auto"));
assert.throws(() => voiceLanguageSchema.parse("it"));

for (const code of VOICE_LANGUAGE_VALUES) {
  assert.equal(voiceLanguageSchema.parse(code), code);
  assert.ok(VOICE_CONSENT_PHRASES[code].trim().length > 0);
}

assert.equal(normalizeVoiceLanguage("ru"), "ru");
assert.equal(normalizeVoiceLanguage("nope"), DEFAULT_VOICE_LANGUAGE);

assert.equal(resolveVoiceLanguageFromUiLocale("en"), "en");
assert.equal(resolveVoiceLanguageFromUiLocale("en-US"), "en");
assert.equal(resolveVoiceLanguageFromUiLocale("ru"), "ru");
assert.equal(resolveVoiceLanguageFromUiLocale("ru-RU"), "ru");
assert.equal(resolveVoiceLanguageFromUiLocale("zh-CN"), "zh");
assert.equal(resolveVoiceLanguageFromUiLocale("es"), "es");
assert.equal(resolveVoiceLanguageFromUiLocale("ka"), DEFAULT_VOICE_LANGUAGE);

assert.equal(getVoiceConsentPhrase("en"), VOICE_CONSENT_PHRASES.en);
assert.equal(getVoiceConsentPhrase("ja"), VOICE_CONSENT_PHRASES.ja);
assert.ok(isVoiceConsentPhraseForLanguage(VOICE_CONSENT_PHRASES.en, "en"));
assert.ok(!isVoiceConsentPhraseForLanguage(VOICE_CONSENT_PHRASES.en, "ru"));
assert.ok(!isVoiceConsentPhraseForLanguage(VOICE_CONSENT_PHRASES.ru, "en"));

console.log("voice-language.test.ts: ok");

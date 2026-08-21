import assert from "node:assert/strict";
import { SUNO_LYRICS_PROMPT_MAX_LENGTH } from "../constants/vocal-gender.js";
import { buildLyricsLanguageInstruction } from "./build-lyrics-language-instruction.js";
import { buildLyricsGenerationProviderPrompt } from "./build-lyrics-generation-prompt.js";
import { resolveLyricsLanguage } from "./resolve-lyrics-language.js";
import { lyricsLanguageSchema } from "./lyrics-language.js";

// Explicit UI selection
{
  const resolved = resolveLyricsLanguage({
    selectedLanguage: "ka",
    prompt: "A melancholic song about losing a friend",
  });
  assert.equal(resolved.code, "ka");
  assert.equal(resolved.englishName, "Georgian");
  assert.equal(resolved.source, "explicit_selection");
}

// Explicit prompt instruction
{
  const resolved = resolveLyricsLanguage({
    selectedLanguage: "auto",
    prompt: "Create a pop song. Lyrics must be in French.",
  });
  assert.equal(resolved.code, "fr");
  assert.equal(resolved.source, "explicit_prompt_instruction");
}

// English prompt
{
  const resolved = resolveLyricsLanguage({
    selectedLanguage: "auto",
    prompt: "A melancholic song about losing a friend",
  });
  assert.equal(resolved.code, "en");
  assert.equal(resolved.source, "prompt_detection");
}

// Georgian prompt
{
  const resolved = resolveLyricsLanguage({
    selectedLanguage: "auto",
    prompt: "სიმღერა თბილისზე და ზაფხულზე",
  });
  assert.equal(resolved.code, "ka");
  assert.equal(resolved.source, "prompt_detection");
}

// Russian prompt
{
  const resolved = resolveLyricsLanguage({
    selectedLanguage: "auto",
    prompt: "Песня о первой любви",
  });
  assert.equal(resolved.code, "ru");
  assert.equal(resolved.source, "prompt_detection");
}

// Spanish prompt
{
  const resolved = resolveLyricsLanguage({
    selectedLanguage: "auto",
    prompt: "Una canción sobre el verano",
  });
  assert.equal(resolved.code, "es");
  assert.equal(resolved.source, "prompt_detection");
}

// Custom lyrics priority
{
  const resolved = resolveLyricsLanguage({
    selectedLanguage: "auto",
    prompt: "Upbeat pop production with bright synths",
    customLyrics: "Una canción sobre el verano y la playa bajo el sol",
  });
  assert.equal(resolved.code, "es");
  assert.equal(resolved.source, "custom_lyrics");
}

// Short ambiguous prompt → ui locale
{
  const resolved = resolveLyricsLanguage({
    selectedLanguage: "auto",
    prompt: "EDM",
    uiLocale: "en",
  });
  assert.equal(resolved.code, "en");
  assert.equal(resolved.source, "ui_locale_fallback");
}

// Russian UI, English request
{
  const resolved = resolveLyricsLanguage({
    selectedLanguage: "auto",
    prompt: "Write a song about the ocean",
    uiLocale: "ru",
  });
  assert.equal(resolved.code, "en");
  assert.equal(resolved.source, "prompt_detection");
}

// Bilingual explicit → internal multi
{
  const resolved = resolveLyricsLanguage({
    selectedLanguage: "auto",
    prompt: "Write bilingual English and Spanish lyrics",
  });
  assert.equal(resolved.code, "multi");
  assert.equal(resolved.source, "explicit_prompt_instruction");
}

// Public schema rejects multi
{
  const parsed = lyricsLanguageSchema.safeParse("multi");
  assert.equal(parsed.success, false);
}

// Provider instruction content
{
  const en = buildLyricsLanguageInstruction({
    code: "en",
    englishName: "English",
    source: "explicit_selection",
  });
  assert.match(en, /Generate all lyrics in English/);
  assert.doesNotMatch(en, /Песня|глаголы|куплет|припев/i);

  const ka = buildLyricsLanguageInstruction({
    code: "ka",
    englishName: "Georgian",
    source: "explicit_selection",
  });
  assert.match(ka, /Georgian/);

  const multi = buildLyricsLanguageInstruction({
    code: "multi",
    englishName: "multilingual as requested",
    source: "explicit_prompt_instruction",
  });
  assert.match(multi, /bilingual|multilingual/i);
  assert.doesNotMatch(multi, /Generate all lyrics in/);
}

// Ordered provider prompt stays within Suno 200-char hard limit
{
  const prompt = buildLyricsGenerationProviderPrompt({
    brief: "песня про двух друзей любовь и дружбу",
    resolvedLanguage: {
      code: "fr",
      englishName: "French",
      source: "explicit_selection",
    },
    vocalGender: "m",
    lyricsDurationSec: 180,
  });

  assert.ok(prompt.length <= SUNO_LYRICS_PROMPT_MAX_LENGTH, `len=${prompt.length}`);
  assert.match(prompt, /French/);
  assert.match(prompt, /песня про двух друзей/);
  assert.match(prompt, /je suis allé, j'étais/);
  assert.match(prompt, /~180s/);
  assert.ok(prompt.indexOf("French") < prompt.indexOf("песня"));
  assert.doesNotMatch(prompt, /Песня ~|куплет|припев|глаголы|женском|мужском/);
}

// Russian gender grammar samples
{
  const prompt = buildLyricsGenerationProviderPrompt({
    brief: "о первой любви",
    resolvedLanguage: {
      code: "ru",
      englishName: "Russian",
      source: "explicit_selection",
    },
    vocalGender: "f",
    lyricsDurationSec: 120,
  });

  assert.ok(prompt.length <= SUNO_LYRICS_PROMPT_MAX_LENGTH);
  assert.match(prompt, /я пошла, я была/);
}

// English / Chinese samples
{
  const en = buildLyricsGenerationProviderPrompt({
    brief: "about the ocean",
    resolvedLanguage: { code: "en", englishName: "English", source: "explicit_selection" },
    vocalGender: "m",
    lyricsDurationSec: 60,
  });
  assert.match(en, /I went, I was/);
  assert.ok(en.length <= SUNO_LYRICS_PROMPT_MAX_LENGTH);

  const zh = buildLyricsGenerationProviderPrompt({
    brief: "夏天的歌",
    resolvedLanguage: { code: "zh", englishName: "Chinese", source: "explicit_selection" },
    vocalGender: "f",
    lyricsDurationSec: 60,
  });
  assert.match(zh, /我走了，我爱过/);
  assert.ok(zh.length <= SUNO_LYRICS_PROMPT_MAX_LENGTH);
}

// Long brief is clipped; language requirement preserved
{
  const longBrief = "a".repeat(300);
  const prompt = buildLyricsGenerationProviderPrompt({
    brief: longBrief,
    resolvedLanguage: {
      code: "en",
      englishName: "English",
      source: "explicit_selection",
    },
    vocalGender: "f",
    lyricsDurationSec: 120,
  });

  assert.ok(prompt.length <= SUNO_LYRICS_PROMPT_MAX_LENGTH);
  assert.match(prompt, /^Generate all lyrics in English/);
  assert.match(prompt, /I went, I was/);
}

console.log("resolve-lyrics-language.test.ts: ok");

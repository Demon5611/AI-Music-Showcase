export {
  LYRICS_LANGUAGE_ENGLISH_NAMES,
  LYRICS_LANGUAGE_VALUES,
  isLyricsLanguage,
  lyricsLanguageSchema,
  normalizeLyricsLanguage,
  type LyricsLanguage,
  type LyricsLanguageSource,
  type ResolvedLyricsLanguage,
  type ResolvedLyricsLanguageCode,
} from "./lyrics-language.js";

export {
  detectExplicitLanguageInstruction,
  detectPrimaryLanguage,
  mapUiLocaleToLanguageCode,
} from "./detect-lyrics-language.js";

export { resolveLyricsLanguage, type ResolveLyricsLanguageInput } from "./resolve-lyrics-language.js";

export { buildLyricsLanguageInstruction } from "./build-lyrics-language-instruction.js";

export {
  buildLyricsGenerationProviderPrompt,
  buildNarratorGenderRequirement,
  buildStructureRequirement,
  resolveLyricsPromptOverheadLength,
} from "./build-lyrics-generation-prompt.js";

export {
  buildNarratorGenderLine,
  resolveGenderGrammarExamples,
} from "./gender-grammar-examples.js";

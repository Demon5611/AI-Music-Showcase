import type { GenerateSongInput } from "../../domain/music.types.js";
import {
  isInstrumentalMode,
  requireSunoGenerationOptions,
} from "../../domain/generate-song-input.js";

const MAX_STYLE_LENGTH = 1000;
const MAX_PROMPT_LENGTH = 500;
const CUSTOM_MODE_CHARS_PER_SEC = 12;
const CUSTOM_MODE_MIN_PROMPT_CHARS = 80;

function truncateCustomModePrompt(prompt: string, durationSec: number): string {
  const maxChars = Math.max(
    CUSTOM_MODE_MIN_PROMPT_CHARS,
    Math.floor(durationSec * CUSTOM_MODE_CHARS_PER_SEC),
  );

  if (prompt.length <= maxChars) {
    return prompt;
  }

  return `${prompt.slice(0, maxChars).trimEnd()}...`;
}

export function applySunoDurationHints(
  input: GenerateSongInput,
  customMode: boolean,
): { prompt: string; style?: string } {
  const durationSec = input.durationSec;

  if (!durationSec || durationSec <= 0) {
    return {
      prompt: input.prompt,
      style: input.style,
    };
  }

  const durationHint = `very short ${durationSec}s track, max ${durationSec} seconds`;

  if (customMode) {
    const styleParts = [input.style?.trim(), durationHint].filter(Boolean);
    const style = styleParts.join(", ").slice(0, MAX_STYLE_LENGTH);

    return {
      prompt: truncateCustomModePrompt(input.prompt, durationSec),
      style,
    };
  }

  const promptSuffix = ` Keep under ${durationSec} seconds, short jingle.`;
  const prompt = `${input.prompt.trim()}${promptSuffix}`.slice(
    0,
    MAX_PROMPT_LENGTH,
  );

  return {
    prompt,
    style: input.style,
  };
}

export function resolveSunoCustomMode(input: GenerateSongInput): boolean {
  const suno = requireSunoGenerationOptions(input);

  if (suno.customMode === false) {
    return false;
  }

  if (suno.customMode === true) {
    return true;
  }

  return Boolean(input.style && input.title);
}

export function resolveSunoInstrumental(input: GenerateSongInput): boolean {
  return isInstrumentalMode(input);
}

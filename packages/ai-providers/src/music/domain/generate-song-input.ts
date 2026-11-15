import type { MusicProviderId } from "./music-provider-id.js";
import { parseAudioengineVariantCount } from "@ai-music/shared";

/**
 * Legacyengine-specific generation knobs. Only Legacyengine adapter + persona/remix builders
 * should construct these — not generic application progress/UI code.
 */
export type LegacyengineGenerationOptions = {
  customMode?: boolean;
  referenceAudioUrl?: string;
  vocalGender?: "m" | "f";
  personaId?: string;
  personaModel?: "voice_persona" | "style_persona";
};

export type AudioengineGenerationOptions = {
  /** Audioengine vocal_id from VoiceProfile.externalId */
  vocalId?: string;
  /** Internal VoiceProfile.id */
  voiceProfileId?: string;
  /** Music style/arrangement prompt (not lyrics). */
  musicPrompt?: string;
  model?: string;
  /**
   * Lyrics-to-Song output count (`n`). Product invariant is always 1
   * (`AUDIOENGINE_OUTPUT_COUNT`); prepareGeneration ignores other values.
   */
  n?: number;
};

export type ProviderGenerationOptions =
  | {
      providerId: "legacyengineapi";
      options: LegacyengineGenerationOptions;
    }
  | {
      providerId: "audioengine";
      options: AudioengineGenerationOptions;
    }
  | {
      providerId: "mock";
      options?: Record<string, never>;
    };

/**
 * Provider-neutral song generation input (in-memory / API core).
 * Persistence still uses the flat legacy shape via toPersistedSongInput.
 */
export interface GenerateSongInput {
  prompt: string;
  style?: string;
  title?: string;
  durationSec?: number;
  /** Default: "song". */
  mode?: "song" | "instrumental";
  /** Public lyrics language code; persisted as metadata, not injected into customMode prompt/style. */
  lyricsLanguage?: string;
  providerOptions?: ProviderGenerationOptions;
}

/**
 * Flat JSON stored in MusicGeneration.providerRequestJson and BullMQ songInputJson.
 * Kept for PR8.3 — no v2 envelope.
 */
export type PersistedSongInput = {
  prompt: string;
  style?: string;
  title?: string;
  instrumental?: boolean;
  customMode?: boolean;
  durationSec?: number;
  referenceAudioUrl?: string;
  personaId?: string;
  personaModel?: "voice_persona" | "style_persona";
  vocalGender?: "m" | "f";
  /** Requested lyrics language code (public allowlist). Metadata only for customMode. */
  lyricsLanguage?: string;
  /** Persisted provider id for multi-provider restore. */
  providerId?: MusicProviderId;
  /** Audioengine vocal_id */
  vocalId?: string;
  voiceProfileId?: string;
  musicPrompt?: string;
  model?: string;
  n?: number;
};

export function isInstrumentalMode(input: GenerateSongInput): boolean {
  return input.mode === "instrumental";
}

export function getLegacyengineGenerationOptions(
  input: GenerateSongInput,
): LegacyengineGenerationOptions | null {
  const options = input.providerOptions;

  if (!options) {
    return {};
  }

  if (options.providerId !== "legacyengineapi") {
    return null;
  }

  return options.options ?? {};
}

export function getAudioengineGenerationOptions(
  input: GenerateSongInput,
): AudioengineGenerationOptions | null {
  const options = input.providerOptions;

  if (!options) {
    return {};
  }

  if (options.providerId !== "audioengine") {
    return null;
  }

  return options.options ?? {};
}

export function withAudioengineGenerationOptions(
  input: GenerateSongInput,
  patch: Partial<AudioengineGenerationOptions>,
): GenerateSongInput {
  const current = getAudioengineGenerationOptions(input) ?? {};

  return {
    ...input,
    providerOptions: {
      providerId: "audioengine",
      options: {
        ...current,
        ...patch,
      },
    },
  };
}

export function requireLegacyengineGenerationOptions(
  input: GenerateSongInput,
  providerId: MusicProviderId = "legacyengineapi",
): LegacyengineGenerationOptions {
  const options = input.providerOptions;

  if (!options) {
    return {};
  }

  if (options.providerId !== providerId) {
    throw new Error(
      `Expected providerOptions.providerId="${providerId}", got "${options.providerId}"`,
    );
  }

  if (options.providerId !== "legacyengineapi") {
    throw new Error(`Legacyengine adapter cannot use providerOptions for ${options.providerId}`);
  }

  return options.options ?? {};
}

export function withLegacyengineGenerationOptions(
  input: GenerateSongInput,
  patch: Partial<LegacyengineGenerationOptions>,
): GenerateSongInput {
  const current = getLegacyengineGenerationOptions(input) ?? {};

  return {
    ...input,
    providerOptions: {
      providerId: "legacyengineapi",
      options: {
        ...current,
        ...patch,
      },
    },
  };
}

export function toPersistedSongInput(input: GenerateSongInput): PersistedSongInput {
  const providerId = input.providerOptions?.providerId;
  const legacyengine = getLegacyengineGenerationOptions(input) ?? {};
  const audioengine = getAudioengineGenerationOptions(input) ?? {};

  const persisted: PersistedSongInput = {
    prompt: input.prompt,
    style: input.style,
    title: input.title,
    durationSec: input.durationSec,
    instrumental: isInstrumentalMode(input),
    customMode: legacyengine.customMode,
    referenceAudioUrl: legacyengine.referenceAudioUrl,
    personaId: legacyengine.personaId,
    personaModel: legacyengine.personaModel,
    vocalGender: legacyengine.vocalGender,
    providerId,
    vocalId: audioengine.vocalId,
    voiceProfileId: audioengine.voiceProfileId,
    musicPrompt: audioengine.musicPrompt,
    model: audioengine.model,
    n: audioengine.n,
  };

  if (input.lyricsLanguage?.trim()) {
    persisted.lyricsLanguage = input.lyricsLanguage.trim();
  }

  return persisted;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Restore neutral input from persisted flat JSON (and tolerate accidental neutral).
 */
export function fromPersistedSongInput(raw: unknown): GenerateSongInput {
  if (!isRecord(raw) || typeof raw.prompt !== "string") {
    throw new Error("Invalid persisted song input: prompt is required");
  }

  if (isRecord(raw.providerOptions) && typeof raw.providerOptions.providerId === "string") {
    return {
      prompt: raw.prompt,
      style: typeof raw.style === "string" ? raw.style : undefined,
      title: typeof raw.title === "string" ? raw.title : undefined,
      durationSec: typeof raw.durationSec === "number" ? raw.durationSec : undefined,
      mode: raw.mode === "instrumental" ? "instrumental" : "song",
      lyricsLanguage: typeof raw.lyricsLanguage === "string" ? raw.lyricsLanguage : undefined,
      providerOptions: raw.providerOptions as GenerateSongInput["providerOptions"],
    };
  }

  const providerId =
    raw.providerId === "audioengine" || raw.providerId === "legacyengineapi" || raw.providerId === "mock"
      ? raw.providerId
      : undefined;

  if (providerId === "audioengine") {
    const parsedN = parseAudioengineVariantCount(raw.n);
    return {
      prompt: raw.prompt,
      style: typeof raw.style === "string" ? raw.style : undefined,
      title: typeof raw.title === "string" ? raw.title : undefined,
      durationSec: typeof raw.durationSec === "number" ? raw.durationSec : undefined,
      mode: raw.instrumental === true ? "instrumental" : "song",
      lyricsLanguage: typeof raw.lyricsLanguage === "string" ? raw.lyricsLanguage : undefined,
      providerOptions: {
        providerId: "audioengine",
        options: {
          vocalId: typeof raw.vocalId === "string" ? raw.vocalId : undefined,
          voiceProfileId:
            typeof raw.voiceProfileId === "string" ? raw.voiceProfileId : undefined,
          musicPrompt:
            typeof raw.musicPrompt === "string"
              ? raw.musicPrompt
              : typeof raw.style === "string"
                ? raw.style
                : undefined,
          model: typeof raw.model === "string" ? raw.model : undefined,
          n: parsedN.ok ? parsedN.value : undefined,
        },
      },
    };
  }

  const instrumental = raw.instrumental === true;
  const vocalGender =
    raw.vocalGender === "m" || raw.vocalGender === "f" ? raw.vocalGender : undefined;
  const personaModel =
    raw.personaModel === "voice_persona" || raw.personaModel === "style_persona"
      ? raw.personaModel
      : undefined;

  return {
    prompt: raw.prompt,
    style: typeof raw.style === "string" ? raw.style : undefined,
    title: typeof raw.title === "string" ? raw.title : undefined,
    durationSec: typeof raw.durationSec === "number" ? raw.durationSec : undefined,
    mode: instrumental ? "instrumental" : "song",
    lyricsLanguage: typeof raw.lyricsLanguage === "string" ? raw.lyricsLanguage : undefined,
    providerOptions: {
      providerId: "legacyengineapi",
      options: {
        customMode: typeof raw.customMode === "boolean" ? raw.customMode : undefined,
        referenceAudioUrl:
          typeof raw.referenceAudioUrl === "string" ? raw.referenceAudioUrl : undefined,
        vocalGender,
        personaId: typeof raw.personaId === "string" ? raw.personaId : undefined,
        personaModel,
      },
    },
  };
}

import type { MusicProviderId } from "./music-provider-id.js";
import { parseMurekaVariantCount } from "@ai-music/shared";

/**
 * Suno-specific generation knobs. Only Suno adapter + persona/remix builders
 * should construct these — not generic application progress/UI code.
 */
export type SunoGenerationOptions = {
  customMode?: boolean;
  referenceAudioUrl?: string;
  vocalGender?: "m" | "f";
  personaId?: string;
  personaModel?: "voice_persona" | "style_persona";
};

export type MurekaGenerationOptions = {
  /** Mureka vocal_id from VoiceProfile.externalId */
  vocalId?: string;
  /** Internal VoiceProfile.id */
  voiceProfileId?: string;
  /** Music style/arrangement prompt (not lyrics). */
  musicPrompt?: string;
  model?: string;
  /**
   * Lyrics-to-Song output count (`n`). Product invariant is always 1
   * (`MUREKA_OUTPUT_COUNT`); prepareGeneration ignores other values.
   */
  n?: number;
};

export type ProviderGenerationOptions =
  | {
      providerId: "sunoapi";
      options: SunoGenerationOptions;
    }
  | {
      providerId: "mureka";
      options: MurekaGenerationOptions;
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
  /** Mureka vocal_id */
  vocalId?: string;
  voiceProfileId?: string;
  musicPrompt?: string;
  model?: string;
  n?: number;
};

export function isInstrumentalMode(input: GenerateSongInput): boolean {
  return input.mode === "instrumental";
}

export function getSunoGenerationOptions(
  input: GenerateSongInput,
): SunoGenerationOptions | null {
  const options = input.providerOptions;

  if (!options) {
    return {};
  }

  if (options.providerId !== "sunoapi") {
    return null;
  }

  return options.options ?? {};
}

export function getMurekaGenerationOptions(
  input: GenerateSongInput,
): MurekaGenerationOptions | null {
  const options = input.providerOptions;

  if (!options) {
    return {};
  }

  if (options.providerId !== "mureka") {
    return null;
  }

  return options.options ?? {};
}

export function withMurekaGenerationOptions(
  input: GenerateSongInput,
  patch: Partial<MurekaGenerationOptions>,
): GenerateSongInput {
  const current = getMurekaGenerationOptions(input) ?? {};

  return {
    ...input,
    providerOptions: {
      providerId: "mureka",
      options: {
        ...current,
        ...patch,
      },
    },
  };
}

export function requireSunoGenerationOptions(
  input: GenerateSongInput,
  providerId: MusicProviderId = "sunoapi",
): SunoGenerationOptions {
  const options = input.providerOptions;

  if (!options) {
    return {};
  }

  if (options.providerId !== providerId) {
    throw new Error(
      `Expected providerOptions.providerId="${providerId}", got "${options.providerId}"`,
    );
  }

  if (options.providerId !== "sunoapi") {
    throw new Error(`Suno adapter cannot use providerOptions for ${options.providerId}`);
  }

  return options.options ?? {};
}

export function withSunoGenerationOptions(
  input: GenerateSongInput,
  patch: Partial<SunoGenerationOptions>,
): GenerateSongInput {
  const current = getSunoGenerationOptions(input) ?? {};

  return {
    ...input,
    providerOptions: {
      providerId: "sunoapi",
      options: {
        ...current,
        ...patch,
      },
    },
  };
}

export function toPersistedSongInput(input: GenerateSongInput): PersistedSongInput {
  const providerId = input.providerOptions?.providerId;
  const suno = getSunoGenerationOptions(input) ?? {};
  const mureka = getMurekaGenerationOptions(input) ?? {};

  const persisted: PersistedSongInput = {
    prompt: input.prompt,
    style: input.style,
    title: input.title,
    durationSec: input.durationSec,
    instrumental: isInstrumentalMode(input),
    customMode: suno.customMode,
    referenceAudioUrl: suno.referenceAudioUrl,
    personaId: suno.personaId,
    personaModel: suno.personaModel,
    vocalGender: suno.vocalGender,
    providerId,
    vocalId: mureka.vocalId,
    voiceProfileId: mureka.voiceProfileId,
    musicPrompt: mureka.musicPrompt,
    model: mureka.model,
    n: mureka.n,
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
    raw.providerId === "mureka" || raw.providerId === "sunoapi" || raw.providerId === "mock"
      ? raw.providerId
      : undefined;

  if (providerId === "mureka") {
    const parsedN = parseMurekaVariantCount(raw.n);
    return {
      prompt: raw.prompt,
      style: typeof raw.style === "string" ? raw.style : undefined,
      title: typeof raw.title === "string" ? raw.title : undefined,
      durationSec: typeof raw.durationSec === "number" ? raw.durationSec : undefined,
      mode: raw.instrumental === true ? "instrumental" : "song",
      lyricsLanguage: typeof raw.lyricsLanguage === "string" ? raw.lyricsLanguage : undefined,
      providerOptions: {
        providerId: "mureka",
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
      providerId: "sunoapi",
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

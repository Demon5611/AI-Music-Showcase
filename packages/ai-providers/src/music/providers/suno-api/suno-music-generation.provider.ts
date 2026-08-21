import type {
  GenerationSubmitContext,
  MusicGenerationProvider,
  PreparedGeneration,
  SubmitGenerationResult,
} from "../../domain/music-generation-provider.js";
import { createPreparedGeneration } from "../../domain/music-generation-provider.js";
import type { GenerateSongInput, GenerationStatusResult } from "../../domain/music.types.js";
import {
  createSunoApiProvider,
  type PreparedSunoMusicGenerate,
  type SunoApiProvider,
} from "./suno-api.provider.js";
import { submitSunoMusicTaskOnce } from "./suno-music-submit-once.js";

const PROVIDER_ID = "sunoapi" as const;

function asSunoPayload(prepared: PreparedGeneration): PreparedSunoMusicGenerate {
  if (prepared.providerId !== PROVIDER_ID) {
    throw new Error(
      `SunoMusicGenerationProvider received prepared from ${prepared.providerId}`,
    );
  }

  return prepared.payload as PreparedSunoMusicGenerate;
}

function applyCallBackUrl(
  sunoPrepared: PreparedSunoMusicGenerate,
  callBackUrl: string | null | undefined,
): PreparedSunoMusicGenerate {
  if (!callBackUrl) {
    return sunoPrepared;
  }

  return {
    ...sunoPrepared,
    body: {
      ...sunoPrepared.body,
      callBackUrl,
    },
  };
}

/**
 * Adapter: MusicGenerationProvider over existing Suno prepare + submit-once.
 * Does not read Worker/API env for HMAC — callBackUrl comes from context.
 */
export class SunoMusicGenerationProvider implements MusicGenerationProvider {
  readonly id = PROVIDER_ID;

  constructor(private readonly suno: SunoApiProvider = createSunoApiProvider()) {}

  prepareGeneration(
    input: GenerateSongInput,
    _context: GenerationSubmitContext,
  ): PreparedGeneration<PreparedSunoMusicGenerate> {
    void _context;
    return createPreparedGeneration(PROVIDER_ID, this.suno.prepareMusicGenerate(input));
  }

  async submitPreparedGeneration(
    prepared: PreparedGeneration,
    context: GenerationSubmitContext,
  ): Promise<SubmitGenerationResult> {
    const sunoPrepared = applyCallBackUrl(asSunoPayload(prepared), context.callBackUrl);
    return submitSunoMusicTaskOnce(sunoPrepared);
  }

  getGenerationStatus(providerTaskId: string): Promise<GenerationStatusResult> {
    return this.suno.getGenerationStatus(providerTaskId);
  }
}

export function createSunoMusicGenerationProvider(
  suno?: SunoApiProvider,
): SunoMusicGenerationProvider {
  return new SunoMusicGenerationProvider(suno ?? createSunoApiProvider());
}

import type {
  GenerationSubmitContext,
  MusicGenerationProvider,
  PreparedGeneration,
  SubmitGenerationResult,
} from "../../domain/music-generation-provider.js";
import { createPreparedGeneration } from "../../domain/music-generation-provider.js";
import type { GenerateSongInput, GenerationStatusResult } from "../../domain/music.types.js";
import {
  createLegacyengineApiProvider,
  type PreparedLegacyengineMusicGenerate,
  type LegacyengineApiProvider,
} from "./legacyengine-api.provider.js";
import { submitLegacyengineMusicTaskOnce } from "./legacyengine-music-submit-once.js";

const PROVIDER_ID = "legacyengineapi" as const;

function asLegacyenginePayload(prepared: PreparedGeneration): PreparedLegacyengineMusicGenerate {
  if (prepared.providerId !== PROVIDER_ID) {
    throw new Error(
      `LegacyengineMusicGenerationProvider received prepared from ${prepared.providerId}`,
    );
  }

  return prepared.payload as PreparedLegacyengineMusicGenerate;
}

function applyCallBackUrl(
  legacyenginePrepared: PreparedLegacyengineMusicGenerate,
  callBackUrl: string | null | undefined,
): PreparedLegacyengineMusicGenerate {
  if (!callBackUrl) {
    return legacyenginePrepared;
  }

  return {
    ...legacyenginePrepared,
    body: {
      ...legacyenginePrepared.body,
      callBackUrl,
    },
  };
}

/**
 * Adapter: MusicGenerationProvider over existing Legacyengine prepare + submit-once.
 * Does not read Worker/API env for HMAC — callBackUrl comes from context.
 */
export class LegacyengineMusicGenerationProvider implements MusicGenerationProvider {
  readonly id = PROVIDER_ID;

  constructor(private readonly legacyengine: LegacyengineApiProvider = createLegacyengineApiProvider()) {}

  prepareGeneration(
    input: GenerateSongInput,
    _context: GenerationSubmitContext,
  ): PreparedGeneration<PreparedLegacyengineMusicGenerate> {
    void _context;
    return createPreparedGeneration(PROVIDER_ID, this.legacyengine.prepareMusicGenerate(input));
  }

  async submitPreparedGeneration(
    prepared: PreparedGeneration,
    context: GenerationSubmitContext,
  ): Promise<SubmitGenerationResult> {
    const legacyenginePrepared = applyCallBackUrl(asLegacyenginePayload(prepared), context.callBackUrl);
    return submitLegacyengineMusicTaskOnce(legacyenginePrepared);
  }

  getGenerationStatus(providerTaskId: string): Promise<GenerationStatusResult> {
    return this.legacyengine.getGenerationStatus(providerTaskId);
  }
}

export function createLegacyengineMusicGenerationProvider(
  legacyengine?: LegacyengineApiProvider,
): LegacyengineMusicGenerationProvider {
  return new LegacyengineMusicGenerationProvider(legacyengine ?? createLegacyengineApiProvider());
}

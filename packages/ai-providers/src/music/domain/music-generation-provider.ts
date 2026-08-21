import type { MusicProviderId } from "./music-provider-id.js";
import type { GenerateSongInput, GenerationStatusResult } from "./music.types.js";

/**
 * Opaque prepared generation for Worker.
 * Worker only holds/passes the object; adapters cast payload to their typed shape.
 */
export type PreparedGeneration<TPayload = unknown> = {
  readonly providerId: MusicProviderId;
  readonly payload: TPayload;
};

export type OpaquePreparedGeneration = PreparedGeneration<unknown>;

export function createPreparedGeneration<TPayload>(
  providerId: MusicProviderId,
  payload: TPayload,
): PreparedGeneration<TPayload> {
  return { providerId, payload };
}

/**
 * App-owned submit context. HMAC / signed callback URL are built by Worker/API;
 * the provider only applies a ready callBackUrl to the vendor payload.
 */
export type GenerationSubmitContext = {
  recordId: string;
  userId: string;
  /**
   * Late-bound callback URL (after CAS). Undefined/null → keep URL from prepare.
   * Never persist this URL in DB / job / providerRequestJson.
   */
  callBackUrl?: string | null;
};

/**
 * Single vendor POST outcome — contractual for worker submission FSM.
 * Same kinds as the former SunoMusicSubmitOnceResult.
 */
export type SubmitGenerationResult =
  | { kind: "ok"; taskId: string }
  | { kind: "failed_terminal"; code: number; message: string }
  | { kind: "retryable_capacity"; code: number; message: string }
  | { kind: "ambiguous"; code?: number; message: string };

/**
 * Narrow server-side contract for music generate submit + status.
 * Does not include credits, FSM, persistence, or callback HMAC.
 */
export interface MusicGenerationProvider {
  readonly id: MusicProviderId;

  prepareGeneration(
    input: GenerateSongInput,
    context: GenerationSubmitContext,
  ): PreparedGeneration;

  /**
   * Exactly one vendor POST. Called only after CAS claim.
   * Context may carry a late-bound callBackUrl from the application.
   */
  submitPreparedGeneration(
    prepared: PreparedGeneration,
    context: GenerationSubmitContext,
  ): Promise<SubmitGenerationResult>;

  getGenerationStatus(providerTaskId: string): Promise<GenerationStatusResult>;
}

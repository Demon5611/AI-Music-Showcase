import type { MusicProviderId } from "./music-provider-id.js";
import type { GeneratedTrack } from "./music.types.js";

export type NormalizedProviderCallbackError = {
  code: string;
  message: string;
  rawCode?: number;
};

export type NormalizedCallbackIgnoreReason =
  | "missing_task_id"
  | "provider_transient"
  | "unmapped_code"
  | "unknown_event";

/**
 * Provider-neutral callback classification.
 * No vendor callbackType enums (text/first/complete) in application layer.
 */
export type NormalizedProviderCallback =
  | {
      kind: "progress";
      providerTaskId: string;
      status: "processing";
      tracks: GeneratedTrack[];
      rawStatus?: string;
    }
  | {
      kind: "completed";
      providerTaskId: string;
      status: "completed";
      tracks: GeneratedTrack[];
      rawStatus?: string;
    }
  | {
      kind: "failed";
      providerTaskId: string;
      status: "failed";
      error: NormalizedProviderCallbackError;
      rawStatus?: string;
    }
  | {
      kind: "ignored";
      providerTaskId?: string;
      reason: NormalizedCallbackIgnoreReason;
      rawStatus?: string;
    }
  | {
      kind: "invalid_payload";
      reason: "malformed_body";
    };

/**
 * Vendor-local callback parsing → provider-neutral DTO.
 * Does not touch HMAC, Prisma, FSM, credits, or HTTP.
 */
export interface MusicGenerationCallbackNormalizer {
  readonly id: MusicProviderId;

  normalizeCallback(rawPayload: unknown): NormalizedProviderCallback;
}

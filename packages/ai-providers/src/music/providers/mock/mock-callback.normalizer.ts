import type {
  MusicGenerationCallbackNormalizer,
  NormalizedProviderCallback,
} from "../../domain/music-generation-callback-normalizer.js";

export type MockCallbackNormalizerOptions = {
  result?: NormalizedProviderCallback | ((raw: unknown) => NormalizedProviderCallback);
};

/**
 * Deterministic normalizer for API callback unit/integration DI tests.
 */
export class MockMusicCallbackNormalizer implements MusicGenerationCallbackNormalizer {
  readonly id = "mock" as const;

  constructor(private readonly options: MockCallbackNormalizerOptions = {}) {}

  normalizeCallback(rawPayload: unknown): NormalizedProviderCallback {
    if (typeof this.options.result === "function") {
      return this.options.result(rawPayload);
    }

    if (this.options.result) {
      return this.options.result;
    }

    return { kind: "invalid_payload", reason: "malformed_body" };
  }
}

export function createMockMusicCallbackNormalizer(
  options?: MockCallbackNormalizerOptions,
): MockMusicCallbackNormalizer {
  return new MockMusicCallbackNormalizer(options);
}

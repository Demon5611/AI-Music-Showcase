import type {
  GenerationSubmitContext,
  MusicGenerationProvider,
  PreparedGeneration,
  SubmitGenerationResult,
} from "../../domain/music-generation-provider.js";
import { createPreparedGeneration } from "../../domain/music-generation-provider.js";
import type { GenerateSongInput, GenerationStatusResult } from "../../domain/music.types.js";

export type MockPreparedPayload = {
  prompt: string;
  customMode?: boolean;
};

export type MockSubmitMode =
  | { kind: "ok"; taskId?: string }
  | { kind: "failed_terminal"; code?: number; message?: string }
  | { kind: "retryable_capacity"; code?: number; message?: string }
  | { kind: "ambiguous"; code?: number; message?: string }
  | { kind: "throw"; message?: string };

export type MockMusicGenerationProviderOptions = {
  submitMode?: MockSubmitMode | ((context: GenerationSubmitContext) => MockSubmitMode);
  /** Invoked on every submitPreparedGeneration (for POST counting). */
  onSubmit?: (
    prepared: PreparedGeneration,
    context: GenerationSubmitContext,
  ) => void | Promise<void>;
  statusByTaskId?: Record<string, GenerationStatusResult>;
};

/**
 * Deterministic poll-oriented provider for Worker DI tests.
 * No HTTP, no callbacks.
 */
export class MockMusicGenerationProvider implements MusicGenerationProvider {
  readonly id = "mock" as const;
  private submitCount = 0;

  constructor(private readonly options: MockMusicGenerationProviderOptions = {}) {}

  getSubmitCount(): number {
    return this.submitCount;
  }

  prepareGeneration(
    input: GenerateSongInput,
    _context: GenerationSubmitContext,
  ): PreparedGeneration<MockPreparedPayload> {
    void _context;
    return createPreparedGeneration(this.id, {
      prompt: input.prompt,
      customMode: input.providerOptions?.providerId === "sunoapi"
        ? input.providerOptions.options.customMode
        : undefined,
    });
  }

  async submitPreparedGeneration(
    prepared: PreparedGeneration,
    context: GenerationSubmitContext,
  ): Promise<SubmitGenerationResult> {
    this.submitCount += 1;
    await this.options.onSubmit?.(prepared, context);

    const mode =
      typeof this.options.submitMode === "function"
        ? this.options.submitMode(context)
        : (this.options.submitMode ?? {
            kind: "ok",
            taskId: `mock_task_${context.recordId}`,
          });

    if (mode.kind === "throw") {
      throw new Error(mode.message ?? "mock submit throw");
    }

    if (mode.kind === "ok") {
      return {
        kind: "ok",
        taskId: mode.taskId ?? `mock_task_${context.recordId}`,
      };
    }

    if (mode.kind === "failed_terminal") {
      return {
        kind: "failed_terminal",
        code: mode.code ?? 400,
        message: mode.message ?? "mock terminal failure",
      };
    }

    if (mode.kind === "retryable_capacity") {
      return {
        kind: "retryable_capacity",
        code: mode.code ?? 430,
        message: mode.message ?? "mock capacity",
      };
    }

    return {
      kind: "ambiguous",
      code: mode.code,
      message: mode.message ?? "mock ambiguous",
    };
  }

  async getGenerationStatus(providerTaskId: string): Promise<GenerationStatusResult> {
    const configured = this.options.statusByTaskId?.[providerTaskId];
    if (configured) {
      return configured;
    }

    return {
      taskId: providerTaskId,
      status: "pending",
      provider: this.id,
    };
  }
}

export function createMockMusicGenerationProvider(
  options?: MockMusicGenerationProviderOptions,
): MockMusicGenerationProvider {
  return new MockMusicGenerationProvider(options);
}

import type {
  DownloadVideoResult,
  SubmitVideoInput,
  SubmitVideoResult,
  VideoProvider,
  VideoTaskStatusResult,
} from "./video-provider.js";

/**
 * Deterministic no-network adapter used by SHOWCASE_MODE/local development.
 * It demonstrates the same lifecycle shape as production video providers
 * without contacting a commercial model API.
 */
export class MockVideoProvider implements VideoProvider {
  readonly id = "mock" as const;

  async submit(input: SubmitVideoInput): Promise<SubmitVideoResult> {
    const providerTaskId = input.existingProviderTaskId ?? "video_demo_task_001";
    return {
      provider: this.id,
      providerTaskId,
      status: "queued",
      reusedExistingTask: Boolean(input.existingProviderTaskId),
    };
  }

  async getStatus(providerTaskId: string): Promise<VideoTaskStatusResult> {
    return {
      provider: this.id,
      providerTaskId,
      status: "succeeded",
      progress: 100,
    };
  }

  async download(providerTaskId: string): Promise<DownloadVideoResult> {
    return {
      provider: this.id,
      providerTaskId,
      bytes: Buffer.from("showcase-video-placeholder"),
      contentType: "video/mp4",
    };
  }
}

export function createMockVideoProvider(): VideoProvider {
  return new MockVideoProvider();
}

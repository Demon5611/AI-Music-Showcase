export type VideoProviderId = "mock" | "cometapi" | "seedance";

export type VideoAspectRatio = "9:16" | "16:9" | "1:1";

export type SubmitVideoInput = {
  prompt: string;
  durationSec: number;
  aspectRatio: VideoAspectRatio;
  sourceImageUrl?: string | null;
  /**
   * Persisted provider task id from an earlier submit attempt.
   * A retry should reconcile this task instead of blindly creating a second paid job.
   */
  existingProviderTaskId?: string | null;
};

export type VideoTaskState = "queued" | "processing" | "succeeded" | "failed";

export type SubmitVideoResult = {
  provider: VideoProviderId;
  providerTaskId: string;
  status: VideoTaskState;
  reusedExistingTask: boolean;
};

export type VideoTaskStatusResult = {
  provider: VideoProviderId;
  providerTaskId: string;
  status: VideoTaskState;
  progress?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type DownloadVideoResult = {
  provider: VideoProviderId;
  providerTaskId: string;
  bytes: Buffer;
  contentType: "video/mp4";
};

/**
 * Public showcase contract for short-form image-to-video generation.
 * Production business code depends on this boundary rather than vendor HTTP clients.
 */
export interface VideoProvider {
  readonly id: VideoProviderId;
  submit(input: SubmitVideoInput): Promise<SubmitVideoResult>;
  getStatus(providerTaskId: string): Promise<VideoTaskStatusResult>;
  download(providerTaskId: string): Promise<DownloadVideoResult>;
  cancel?(providerTaskId: string): Promise<void>;
}

import { throwVoiceadapterApiError } from "./voiceadapter-api-error.js";

export interface PollOptions {
  intervalMs?: number;
  maxAttempts?: number;
}

export async function pollUntilComplete<T>(
  fetchStatus: () => Promise<T>,
  isTerminal: (result: T) => boolean,
  options: PollOptions = {},
): Promise<T> {
  const intervalMs = options.intervalMs ?? 2500;
  const maxAttempts = options.maxAttempts ?? 120;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await fetchStatus();

    if (isTerminal(result)) {
      return result;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  throw new Error("Voiceadapter job polling timed out");
}

export function isVoiceadapterJobRunning(status: string): boolean {
  return status === "running";
}

export function isVoiceadapterJobSuccess(status: string): boolean {
  return status === "success";
}

export function isVoiceadapterJobFailed(status: string): boolean {
  return status === "error" || status === "cancelled";
}

export async function downloadUrl(url: string): Promise<Buffer> {
  const response = await fetch(url);

  if (!response.ok) {
    await throwVoiceadapterApiError(response, "Download Voiceadapter output file");
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

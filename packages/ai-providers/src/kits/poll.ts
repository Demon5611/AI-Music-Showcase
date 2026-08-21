import { throwKitsApiError } from "./kits-api-error.js";

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

  throw new Error("Kits job polling timed out");
}

export function isKitsJobRunning(status: string): boolean {
  return status === "running";
}

export function isKitsJobSuccess(status: string): boolean {
  return status === "success";
}

export function isKitsJobFailed(status: string): boolean {
  return status === "error" || status === "cancelled";
}

export async function downloadUrl(url: string): Promise<Buffer> {
  const response = await fetch(url);

  if (!response.ok) {
    await throwKitsApiError(response, "Download Kits output file");
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

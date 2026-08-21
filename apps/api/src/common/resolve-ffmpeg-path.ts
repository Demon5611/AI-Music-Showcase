import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function resolveBundledFfmpegPath(): string | null {
  const bundledPath = require("ffmpeg-static") as string | null | undefined;

  if (!bundledPath) {
    return null;
  }

  return bundledPath;
}

export function resolveFfmpegPath(): string {
  const configuredPath = process.env.FFMPEG_PATH?.trim();

  if (configuredPath) {
    return configuredPath;
  }

  const bundledPath = resolveBundledFfmpegPath();

  if (bundledPath) {
    return bundledPath;
  }

  return "ffmpeg";
}

export function isFfmpegMissingError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errno = error as NodeJS.ErrnoException;

  if (errno.code === "ENOENT") {
    return true;
  }

  const message = error.message.toLowerCase();

  return message.includes("enoent") && message.includes("ffmpeg");
}

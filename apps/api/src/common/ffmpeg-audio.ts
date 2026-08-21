import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { BadRequestError } from "./errors.js";
import { isFfmpegMissingError, resolveFfmpegPath } from "./resolve-ffmpeg-path.js";

export async function assertFfmpegAvailable(): Promise<void> {
  const ffmpegPath = resolveFfmpegPath();

  if (ffmpegPath === "ffmpeg") {
    return;
  }

  try {
    await access(ffmpegPath, constants.X_OK);
  } catch {
    throw new BadRequestError(
      "ffmpeg is not available on the server. Install ffmpeg or set FFMPEG_PATH.",
      "FFMPEG_MISSING",
    );
  }
}

async function runFfmpeg(args: string[], options?: { cwd?: string }): Promise<void> {
  const ffmpegPath = resolveFfmpegPath();

  await new Promise<void>((resolve, reject) => {
    const processRef = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: options?.cwd,
    });
    let stderr = "";

    processRef.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    processRef.on("error", (error) => {
      reject(error);
    });

    processRef.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

export async function convertMp3FileToWav(inputPath: string, outputPath: string): Promise<void> {
  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-acodec",
    "pcm_s16le",
    "-ar",
    "44100",
    outputPath,
  ]);
}

export async function convertAudioFileToMp3(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-codec:a",
    "libmp3lame",
    "-ar",
    "44100",
    "-ac",
    "1",
    "-b:a",
    "192k",
    outputPath,
  ]);
}

export { isFfmpegMissingError, runFfmpeg };

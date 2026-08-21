import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EditOperation, EditorTrackId } from "@ai-music/shared";
import { prisma, Prisma } from "@ai-music/db";
import { BadRequestError, NotFoundError } from "../../common/errors.js";
import { assertFeature } from "../billing/entitlements.service.js";
import { isFfmpegMissingError, resolveFfmpegPath } from "../../common/resolve-ffmpeg-path.js";
import { buildSongRenderKey, getStorageService } from "../storage/storage.service.js";
import { parseOperations } from "./song-editor.mapper.js";
import { getCurrentVersion, getSongForUser } from "./song-editor.service.js";
import { resolveVocalPresetFfmpegFilters } from "./voice-preset-ffmpeg.js";

interface RegionSlice {
  id: string;
  startMs: number;
  endMs: number;
}

function resolveTrackRegions(
  trackId: EditorTrackId,
  regions: RegionSlice[],
  operations: EditOperation[],
): RegionSlice[] {
  const trackRegions = regions.map((region) => ({ ...region }));

  for (const operation of operations) {
    if (!("trackId" in operation) || operation.trackId !== trackId) {
      continue;
    }

    if (operation.type === "RESIZE_TRACK_REGION") {
      const region = trackRegions.find((item) => item.id === operation.regionId);

      if (region) {
        region.startMs = operation.startMs;
        region.endMs = operation.endMs;
      }
    }

    if (operation.type === "MOVE_TRACK_REGION") {
      const fromIndex = trackRegions.findIndex((item) => item.id === operation.regionId);

      if (fromIndex < 0) {
        continue;
      }

      const targetIndex = Math.min(operation.targetIndex, trackRegions.length - 1);
      const [moved] = trackRegions.splice(fromIndex, 1);
      trackRegions.splice(targetIndex, 0, moved);
    }
  }

  return trackRegions;
}

function resolveActiveSoloTrackId(
  regionId: string,
  operations: EditOperation[],
): "vocal" | "instrumental" | null {
  let soloTrackId: "vocal" | "instrumental" | null = null;

  for (const operation of operations) {
    if (!("regionId" in operation) || operation.regionId !== regionId) {
      continue;
    }

    if (operation.type !== "SOLO_TRACK") {
      continue;
    }

    if (operation.solo) {
      soloTrackId = operation.trackId;
      continue;
    }

    if (operation.trackId === soloTrackId) {
      soloTrackId = null;
    }
  }

  return soloTrackId;
}

function resolveRegionGainDb(
  trackId: "vocal" | "instrumental",
  regionId: string,
  operations: EditOperation[],
): number {
  const soloTrackId = resolveActiveSoloTrackId(regionId, operations);

  if (soloTrackId !== null && trackId !== soloTrackId) {
    return -80;
  }

  let gainDb = 0;
  let muted = false;

  for (const operation of operations) {
    if (operation.type === "MUTE_TRACK" && operation.trackId === trackId) {
      muted = operation.muted;
      continue;
    }

    if (
      operation.type === "SET_VOLUME" &&
      operation.trackId === trackId &&
      operation.regionId === regionId
    ) {
      gainDb = operation.gainDb;
    }
  }

  if (muted) {
    return -80;
  }

  return gainDb;
}

function resolveFadeFilters(
  trackId: "vocal" | "instrumental",
  regionId: string,
  regionStartMs: number,
  regionEndMs: number,
  operations: EditOperation[],
): string[] {
  const filters: string[] = [];

  for (const operation of operations) {
    if (
      operation.type !== "FADE" ||
      operation.trackId !== trackId ||
      operation.regionId !== regionId
    ) {
      continue;
    }

    const rangeStartMs = operation.rangeStartMs ?? regionStartMs;
    const rangeEndMs = operation.rangeEndMs ?? regionEndMs;
    const rangeLengthMs = Math.max(0, rangeEndMs - rangeStartMs);

    if (rangeLengthMs <= 0) {
      continue;
    }

    const fadeSec = Math.min(operation.durationMs / 1000, rangeLengthMs / 1000);

    if (operation.fadeType === "in") {
      const startSec = Math.max(0, (rangeStartMs - regionStartMs) / 1000);
      filters.push(`afade=t=in:st=${startSec}:d=${fadeSec}`);
    } else {
      const startSec = Math.max(0, (rangeEndMs - regionStartMs) / 1000 - fadeSec);
      filters.push(`afade=t=out:st=${startSec}:d=${fadeSec}`);
    }
  }

  return filters;
}

async function runFfmpeg(args: string[]): Promise<void> {
  const ffmpegPath = resolveFfmpegPath();

  await new Promise<void>((resolve, reject) => {
    const processRef = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
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

async function extractSegment(
  inputPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number,
  filters: string[],
): Promise<void> {
  const filterChain = filters.length > 0 ? ["-af", filters.join(",")] : [];
  await runFfmpeg([
    "-y",
    "-ss",
    String(startSec),
    "-t",
    String(durationSec),
    "-i",
    inputPath,
    ...filterChain,
    "-c:a",
    "libmp3lame",
    outputPath,
  ]);
}

async function concatSegments(segmentPaths: string[], outputPath: string) {
  const listPath = `${outputPath}.txt`;
  const listContent = segmentPaths.map((path) => `file '${path}'`).join("\n");
  await writeFile(listPath, listContent);

  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath]);
}

async function mixTracks(
  vocalPath: string,
  instrumentalPath: string,
  outputPath: string,
): Promise<void> {
  await runFfmpeg([
    "-y",
    "-i",
    vocalPath,
    "-i",
    instrumentalPath,
    "-filter_complex",
    "amix=inputs=2:duration=longest:dropout_transition=0",
    "-c:a",
    "libmp3lame",
    outputPath,
  ]);
}

async function renderStemTrack({
  trackId,
  inputPath,
  outputPath,
  workDir,
  regions,
  operations,
}: {
  trackId: EditorTrackId;
  inputPath: string;
  outputPath: string;
  workDir: string;
  regions: RegionSlice[];
  operations: EditOperation[];
}): Promise<void> {
  const segmentPaths: string[] = [];

  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const startSec = region.startMs / 1000;
    const durationSec = (region.endMs - region.startMs) / 1000;

    if (durationSec <= 0) {
      continue;
    }

    const segmentPath = join(workDir, `${trackId}-${index}.mp3`);
    const gainDb = resolveRegionGainDb(trackId, region.id, operations);
    const presetFilters = trackId === "vocal" ? resolveVocalPresetFfmpegFilters(operations) : [];
    const filters = [
      `volume=${gainDb}dB`,
      ...presetFilters,
      ...resolveFadeFilters(trackId, region.id, region.startMs, region.endMs, operations),
    ];

    await extractSegment(inputPath, segmentPath, startSec, durationSec, filters);
    segmentPaths.push(segmentPath);
  }

  if (segmentPaths.length === 0) {
    throw new BadRequestError(`No ${trackId} regions available for render`);
  }

  await concatSegments(segmentPaths, outputPath);
}

async function assertFfmpegAvailable(): Promise<void> {
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

export async function renderSongVersion(userId: string, songId: string) {
  await assertFeature(userId, "editor");
  await assertFfmpegAvailable();

  const song = await getSongForUser(userId, songId);

  if (song.status !== "ready") {
    throw new BadRequestError("Song is not ready for render");
  }

  const vocalStem = song.stems.find((stem) => stem.type === "vocal");
  const instrumentalStem = song.stems.find((stem) => stem.type === "instrumental");

  if (!vocalStem || !instrumentalStem) {
    throw new BadRequestError("Vocal and instrumental stems are required");
  }

  const version = await getCurrentVersion(songId);
  const operations = parseOperations(version.operations);

  const nextVersionNumber = (song.versions.at(0)?.versionNumber ?? version.versionNumber) + 1;

  const newVersion = await prisma.songVersion.create({
    data: {
      songId,
      versionNumber: nextVersionNumber,
      status: "rendering",
      operations: {
        create: operations.map((operation) => ({
          operationType: operation.type,
          payloadJson: operation as unknown as Prisma.InputJsonValue,
        })),
      },
    },
  });

  const renderJob = await prisma.renderJob.create({
    data: {
      songId,
      songVersionId: newVersion.id,
      status: "processing",
    },
  });

  try {
    const storage = getStorageService();
    const vocalBuffer = await storage.get(vocalStem.audioStorageKey);
    const instrumentalBuffer = await storage.get(instrumentalStem.audioStorageKey);

    const workDir = await mkdtemp(join(tmpdir(), "ai-music-render-"));
    const vocalInput = join(workDir, "vocal.mp3");
    const instrumentalInput = join(workDir, "instrumental.mp3");
    await writeFile(vocalInput, vocalBuffer);
    await writeFile(instrumentalInput, instrumentalBuffer);

    const regions: RegionSlice[] = song.regions
      .slice()
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((region) => ({
        id: region.id,
        startMs: region.startMs,
        endMs: region.endMs,
      }));

    const vocalOutput = join(workDir, "vocal-track.mp3");
    const instrumentalOutput = join(workDir, "instrumental-track.mp3");
    const finalOutput = join(workDir, "final.mp3");
    const vocalRegions = resolveTrackRegions("vocal", regions, operations);
    const instrumentalRegions = resolveTrackRegions("instrumental", regions, operations);

    await renderStemTrack({
      trackId: "vocal",
      inputPath: vocalInput,
      outputPath: vocalOutput,
      workDir,
      regions: vocalRegions,
      operations,
    });
    await renderStemTrack({
      trackId: "instrumental",
      inputPath: instrumentalInput,
      outputPath: instrumentalOutput,
      workDir,
      regions: instrumentalRegions,
      operations,
    });
    await mixTracks(vocalOutput, instrumentalOutput, finalOutput);

    const renderedBuffer = await readFile(finalOutput);
    const renderKey = buildSongRenderKey(userId, songId, newVersion.versionNumber);
    await storage.putObject({
      key: renderKey,
      body: renderedBuffer,
      contentType: "audio/mpeg",
      kind: "song_render",
      userId,
      entityType: "song_version",
      entityId: newVersion.id,
      visibility: "private",
    });

    await prisma.songVersion.update({
      where: { id: newVersion.id },
      data: {
        status: "completed",
        renderedAudioKey: renderKey,
      },
    });

    await prisma.renderJob.update({
      where: { id: renderJob.id },
      data: { status: "completed" },
    });

    await rm(workDir, { recursive: true, force: true });

    return {
      renderJobId: renderJob.id,
      songVersionId: newVersion.id,
      status: "completed",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Render failed";

    await prisma.songVersion.update({
      where: { id: newVersion.id },
      data: { status: "failed" },
    });

    await prisma.renderJob.update({
      where: { id: renderJob.id },
      data: {
        status: "failed",
        errorMessage: message,
      },
    });

    if (isFfmpegMissingError(error)) {
      throw new BadRequestError(
        "ffmpeg is not available on the server. Install ffmpeg or set FFMPEG_PATH.",
        "FFMPEG_MISSING",
      );
    }

    throw error;
  }
}

export async function getRenderJob(userId: string, songId: string, jobId: string) {
  const job = await prisma.renderJob.findUnique({
    where: { id: jobId },
  });

  if (!job || job.songId !== songId) {
    throw new NotFoundError("Render job not found");
  }

  await getSongForUser(userId, songId);

  return job;
}

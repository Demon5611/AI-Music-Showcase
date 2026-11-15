import type { MusicGenerationStatus } from "../../domain/music-status.js";
import type {
  GeneratedLyrics,
  GeneratedTrack,
  GenerationStatusResult,
} from "../../domain/music.types.js";
import {
  mapLegacyengineLyricsTaskStatusToError,
  mapLegacyengineMusicTaskStatusToError,
} from "./legacyengine-api.errors.js";
import type {
  LegacyengineLyricsTaskRaw,
  LegacyengineMusicTaskRaw,
  LegacyengineTrackRaw,
} from "./legacyengine-api.types.js";

const PROVIDER_ID = "legacyengineapi" as const;

export function mapLegacyengineMusicStatus(status: string): MusicGenerationStatus {
  if (status === "PENDING") {
    return "pending";
  }

  if (
    status === "TEXT_SUCCESS" ||
    status === "FIRST_SUCCESS" ||
    status === "GENERATING"
  ) {
    return "processing";
  }

  if (status === "SUCCESS") {
    return "completed";
  }

  return "failed";
}

export function mapLegacyengineLyricsStatus(status: string): MusicGenerationStatus {
  if (status === "PENDING") {
    return "pending";
  }

  if (status === "SUCCESS") {
    return "completed";
  }

  return "failed";
}

export function mapLegacyengineTrack(raw: LegacyengineTrackRaw): GeneratedTrack {
  return {
    id: raw.id,
    title: raw.title ?? "Untitled",
    audioUrl: raw.audioUrl ?? raw.audio_url ?? "",
    streamAudioUrl: raw.streamAudioUrl ?? raw.stream_audio_url,
    imageUrl: raw.imageUrl ?? raw.image_url,
    durationSec: raw.duration,
    lyricsText: raw.prompt,
    tags: raw.tags,
  };
}

export function extractLegacyengineTracks(task: LegacyengineMusicTaskRaw): GeneratedTrack[] {
  const items =
    task.response?.legacyengineData ??
    task.response?.data ??
    [];

  return items.filter((item) => Boolean(item.id)).map(mapLegacyengineTrack);
}

export function mapLegacyengineLyricsItems(
  task: LegacyengineLyricsTaskRaw,
): GeneratedLyrics[] {
  const items = task.response?.data ?? [];

  return items
    .filter((item) => item.text.trim().length > 0)
    .map((item) => ({
      title: item.title,
      text: item.text,
    }));
}

function resolvePlayableTracks(
  task: LegacyengineMusicTaskRaw,
  status: MusicGenerationStatus,
): GeneratedTrack[] | undefined {
  if (status !== "processing" && status !== "completed") {
    return undefined;
  }

  const tracks = extractLegacyengineTracks(task).filter(
    (track) => track.audioUrl.length > 0 || Boolean(track.streamAudioUrl),
  );

  if (tracks.length === 0) {
    return undefined;
  }

  return tracks.map((track) => ({
    ...track,
    audioUrl: track.audioUrl || track.streamAudioUrl || "",
  }));
}

export function mapLegacyengineMusicTaskToStatus(
  task: LegacyengineMusicTaskRaw,
): GenerationStatusResult {
  const status = mapLegacyengineMusicStatus(task.status);
  const taskError = mapLegacyengineMusicTaskStatusToError(task.status, task.errorMessage);

  return {
    taskId: task.taskId,
    status,
    provider: PROVIDER_ID,
    tracks: resolvePlayableTracks(task, status),
    errorMessage: taskError?.message ?? task.errorMessage ?? undefined,
    rawStatus: task.status,
  };
}

export function mapLegacyengineLyricsTaskToStatus(
  task: LegacyengineLyricsTaskRaw,
): GenerationStatusResult {
  const status = mapLegacyengineLyricsStatus(task.status);
  const taskError = mapLegacyengineLyricsTaskStatusToError(task.status, task.errorMessage);

  return {
    taskId: task.taskId,
    status,
    provider: PROVIDER_ID,
    lyrics: status === "completed" ? mapLegacyengineLyricsItems(task) : undefined,
    errorMessage: taskError?.message ?? task.errorMessage ?? undefined,
    rawStatus: task.status,
  };
}

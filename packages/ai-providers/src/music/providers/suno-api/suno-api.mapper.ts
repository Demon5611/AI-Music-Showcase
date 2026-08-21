import type { MusicGenerationStatus } from "../../domain/music-status.js";
import type {
  GeneratedLyrics,
  GeneratedTrack,
  GenerationStatusResult,
} from "../../domain/music.types.js";
import {
  mapSunoLyricsTaskStatusToError,
  mapSunoMusicTaskStatusToError,
} from "./suno-api.errors.js";
import type {
  SunoLyricsTaskRaw,
  SunoMusicTaskRaw,
  SunoTrackRaw,
} from "./suno-api.types.js";

const PROVIDER_ID = "sunoapi" as const;

export function mapSunoMusicStatus(status: string): MusicGenerationStatus {
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

export function mapSunoLyricsStatus(status: string): MusicGenerationStatus {
  if (status === "PENDING") {
    return "pending";
  }

  if (status === "SUCCESS") {
    return "completed";
  }

  return "failed";
}

export function mapSunoTrack(raw: SunoTrackRaw): GeneratedTrack {
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

export function extractSunoTracks(task: SunoMusicTaskRaw): GeneratedTrack[] {
  const items =
    task.response?.sunoData ??
    task.response?.data ??
    [];

  return items.filter((item) => Boolean(item.id)).map(mapSunoTrack);
}

export function mapSunoLyricsItems(
  task: SunoLyricsTaskRaw,
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
  task: SunoMusicTaskRaw,
  status: MusicGenerationStatus,
): GeneratedTrack[] | undefined {
  if (status !== "processing" && status !== "completed") {
    return undefined;
  }

  const tracks = extractSunoTracks(task).filter(
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

export function mapSunoMusicTaskToStatus(
  task: SunoMusicTaskRaw,
): GenerationStatusResult {
  const status = mapSunoMusicStatus(task.status);
  const taskError = mapSunoMusicTaskStatusToError(task.status, task.errorMessage);

  return {
    taskId: task.taskId,
    status,
    provider: PROVIDER_ID,
    tracks: resolvePlayableTracks(task, status),
    errorMessage: taskError?.message ?? task.errorMessage ?? undefined,
    rawStatus: task.status,
  };
}

export function mapSunoLyricsTaskToStatus(
  task: SunoLyricsTaskRaw,
): GenerationStatusResult {
  const status = mapSunoLyricsStatus(task.status);
  const taskError = mapSunoLyricsTaskStatusToError(task.status, task.errorMessage);

  return {
    taskId: task.taskId,
    status,
    provider: PROVIDER_ID,
    lyrics: status === "completed" ? mapSunoLyricsItems(task) : undefined,
    errorMessage: taskError?.message ?? task.errorMessage ?? undefined,
    rawStatus: task.status,
  };
}

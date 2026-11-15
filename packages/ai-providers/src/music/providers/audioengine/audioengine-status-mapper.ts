import type { MusicGenerationStatus } from "../../domain/music-status.js";
import type { GeneratedTrack, GenerationStatusResult } from "../../domain/music.types.js";
import { AUDIOENGINE_OUTPUT_COUNT, logLoadControl } from "@ai-music/shared";
import {
  AUDIOENGINE_PROVIDER_ID,
  AUDIOENGINE_TERMINAL_STATUSES,
  type AudioengineChoice,
  type AudioengineQuerySongResponse,
} from "./audioengine-types.js";

function normalizeStatus(raw: string): string {
  return raw.trim().toLowerCase();
}

export function mapAudioengineStatusToMusicStatus(rawStatus: string): MusicGenerationStatus {
  const status = normalizeStatus(rawStatus);

  if (status === "succeeded" || status === "success" || status === "completed") {
    return "completed";
  }

  if (
    status === "failed" ||
    status === "cancelled" ||
    status === "canceled" ||
    status === "timeouted" ||
    status === "timedout" ||
    status === "timeout"
  ) {
    return "failed";
  }

  if (
    status === "pending" ||
    status === "queued" ||
    status === "preparing" ||
    status === "running" ||
    status === "processing" ||
    status === "generating"
  ) {
    return status === "pending" || status === "queued" ? "pending" : "processing";
  }

  return "processing";
}

export function isAudioengineTerminalStatus(rawStatus: string): boolean {
  const status = normalizeStatus(rawStatus);
  return (AUDIOENGINE_TERMINAL_STATUSES as readonly string[]).includes(status) ||
    status === "success" ||
    status === "completed" ||
    status === "canceled";
}

function resolveChoiceAudioUrl(choice: AudioengineChoice): string | null {
  const url = choice.mp3_url ?? choice.audio_url ?? choice.url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

function resolveChoiceDurationSec(choice: AudioengineChoice): number | undefined {
  if (typeof choice.duration_sec === "number" && Number.isFinite(choice.duration_sec)) {
    return choice.duration_sec;
  }
  if (typeof choice.duration === "number" && Number.isFinite(choice.duration)) {
    // Some payloads return ms.
    return choice.duration > 1_000 ? choice.duration / 1000 : choice.duration;
  }
  return undefined;
}

function mapTimedLyrics(choice: AudioengineChoice): GeneratedTrack["timedLyrics"] | undefined {
  if (!choice.timed_lyrics?.length) {
    return undefined;
  }

  return choice.timed_lyrics
    .map((line) => {
      const startSec =
        typeof line.start === "number"
          ? line.start
          : typeof line.start_ms === "number"
            ? line.start_ms / 1000
            : undefined;
      const endSec =
        typeof line.end === "number"
          ? line.end
          : typeof line.end_ms === "number"
            ? line.end_ms / 1000
            : undefined;
      const text = typeof line.text === "string" ? line.text : "";

      if (startSec === undefined || endSec === undefined) {
        return null;
      }

      return { startSec, endSec, text };
    })
    .filter((line): line is { startSec: number; endSec: number; text: string } => line !== null);
}

export function mapAudioengineChoiceToGeneratedTrack(
  choice: AudioengineChoice,
  index: number,
  taskId: string,
): GeneratedTrack | null {
  const audioUrl = resolveChoiceAudioUrl(choice);
  if (!audioUrl) {
    return null;
  }

  const id =
    (typeof choice.id === "string" && choice.id.trim()) ||
    `${taskId}:${typeof choice.index === "number" ? choice.index : index}`;

  const timedLyrics = mapTimedLyrics(choice);

  return {
    id,
    title: choice.title?.trim() || `Choice ${index + 1}`,
    audioUrl,
    durationSec: resolveChoiceDurationSec(choice),
    // Official query choices (integration.example.invalid) have no cover/image fields — UI initials fallback.
    lyricsText: typeof choice.lyrics === "string" ? choice.lyrics : undefined,
    timedLyrics: timedLyrics?.length ? timedLyrics : undefined,
    metadata: choice.lyrics_sections
      ? { lyrics_sections: choice.lyrics_sections }
      : undefined,
  };
}

export function extractAudioengineChoices(response: AudioengineQuerySongResponse): AudioengineChoice[] {
  if (Array.isArray(response.choices) && response.choices.length > 0) {
    return response.choices;
  }
  if (Array.isArray(response.data?.choices) && response.data.choices.length > 0) {
    return response.data.choices;
  }
  return [];
}

/**
 * Apply product single-output invariant to provider query choices.
 * Unexpected extras are truncated to the first choice with a structured warning.
 */
export function selectAudioengineChoicesForProduct(
  taskId: string,
  choices: AudioengineChoice[],
): AudioengineChoice[] {
  if (choices.length <= AUDIOENGINE_OUTPUT_COUNT) {
    return choices;
  }

  logLoadControl(
    "audioengine_choices_anomaly",
    {
      provider: AUDIOENGINE_PROVIDER_ID,
      taskId,
      choicesCount: choices.length,
      expected: AUDIOENGINE_OUTPUT_COUNT,
      status: "truncated_to_first",
    },
    "warn",
  );

  return choices.slice(0, AUDIOENGINE_OUTPUT_COUNT);
}

export function mapAudioengineQueryToGenerationStatus(
  taskId: string,
  response: AudioengineQuerySongResponse,
): GenerationStatusResult {
  const rawStatus = response.data?.status ?? response.status;
  const status = mapAudioengineStatusToMusicStatus(rawStatus);
  const choices = selectAudioengineChoicesForProduct(taskId, extractAudioengineChoices(response));
  const tracks = choices
    .map((choice, index) => mapAudioengineChoiceToGeneratedTrack(choice, index, taskId))
    .filter((track): track is GeneratedTrack => track !== null);

  const errorMessage =
    status === "failed"
      ? response.failed_reason ?? response.error ?? response.message ?? `Audioengine task failed: ${rawStatus}`
      : undefined;

  return {
    taskId,
    status,
    provider: AUDIOENGINE_PROVIDER_ID,
    tracks: tracks.length > 0 ? tracks : undefined,
    errorMessage,
    rawStatus,
  };
}

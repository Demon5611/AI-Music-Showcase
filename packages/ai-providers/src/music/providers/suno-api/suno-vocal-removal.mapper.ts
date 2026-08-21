import type { StemResult } from "../../domain/music.types.js";
import type { SunoVocalRemovalTaskRaw } from "./suno-api.types.js";

const FAILED_FLAGS = new Set([
  "FAILED",
  "CREATE_TASK_FAILED",
  "GENERATE_AUDIO_FAILED",
  "CALLBACK_EXCEPTION",
  "SENSITIVE_WORD_ERROR",
]);

export function mapSunoVocalRemovalTaskToStemResult(task: SunoVocalRemovalTaskRaw): StemResult {
  const flag = task.successFlag?.trim().toUpperCase() ?? "";

  if (flag === "SUCCESS") {
    const response = task.response;

    return {
      taskId: task.taskId,
      status: "completed",
      vocalUrl: response?.vocalUrl ?? response?.vocal_url,
      instrumentalUrl: response?.instrumentalUrl ?? response?.instrumental_url,
    };
  }

  if (FAILED_FLAGS.has(flag) || flag.endsWith("_FAILED")) {
    return {
      taskId: task.taskId,
      status: "failed",
      errorMessage: task.errorMessage ?? "Stem separation failed",
    };
  }

  return {
    taskId: task.taskId,
    status: "processing",
  };
}

import type { AlbumCoverStatusResult } from "../../domain/music.types.js";
import type { SunoAlbumCoverTaskRaw } from "./suno-api.types.js";

export function mapSunoAlbumCoverTaskToStatus(
  task: SunoAlbumCoverTaskRaw | null | undefined,
): AlbumCoverStatusResult {
  if (!task) {
    return { status: "pending", images: [] };
  }

  const images = (task.response?.images ?? []).filter((url) => url.trim().length > 0);
  const flag = task.successFlag;

  if (flag === 1 && images.length > 0) {
    return { status: "completed", images };
  }

  if (flag === 3) {
    return {
      status: "failed",
      images: [],
      errorMessage: task.errorMessage ?? "Album cover generation failed",
    };
  }

  if (flag === 2) {
    return { status: "processing", images };
  }

  return { status: "pending", images };
}

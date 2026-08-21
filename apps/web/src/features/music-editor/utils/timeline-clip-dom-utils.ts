import type { ClipTrack } from "@waveform-playlist/core";
import type { EditorTrackId } from "@ai-music/shared";
import { parseTimelineClipId } from "@/features/music-editor/utils/waveform-playlist-utils";

export function resolveClipIdFromTarget(target: Element): string | null {
  const header = target.closest("[data-clip-id]");

  if (header) {
    return header.getAttribute("data-clip-id");
  }

  const clipContainer = target.closest("[data-clip-container]");

  if (!clipContainer) {
    return null;
  }

  return clipContainer.querySelector("[data-clip-id]")?.getAttribute("data-clip-id") ?? null;
}

function findTrackRowElement(
  container: HTMLElement,
  playlistTrackId: string,
): HTMLElement | null {
  const escapedTrackId =
    typeof CSS !== "undefined" && "escape" in CSS
      ? CSS.escape(playlistTrackId)
      : playlistTrackId;

  const trackRow = container.querySelector(`[data-track-id="${escapedTrackId}"]`);

  return trackRow instanceof HTMLElement ? trackRow : null;
}

export function resolveClipContainerByIndex(
  container: HTMLElement,
  tracks: ClipTrack[],
  trackIndex: number,
  clipIndex: number,
): HTMLElement | null {
  const track = tracks[trackIndex];

  if (!track) {
    return null;
  }

  const trackRow = findTrackRowElement(container, track.id);

  if (!trackRow) {
    return null;
  }

  const clipContainers = trackRow.querySelectorAll("[data-clip-container]");
  const clipContainer = clipContainers.item(clipIndex);

  return clipContainer instanceof HTMLElement ? clipContainer : null;
}

export function resolveClipContainersForRegion(
  container: HTMLElement,
  tracks: ClipTrack[],
  regionId: string,
  trackIds: EditorTrackId[] | null,
): HTMLElement[] {
  const matches: HTMLElement[] = [];

  tracks.forEach((track, trackIndex) => {
    track.clips.forEach((clip, clipIndex) => {
      const parsed = parseTimelineClipId(clip.id);

      if (!parsed || parsed.regionId !== regionId) {
        return;
      }

      if (trackIds && !trackIds.includes(parsed.trackId)) {
        return;
      }

      const clipContainer = resolveClipContainerByIndex(container, tracks, trackIndex, clipIndex);

      if (clipContainer) {
        matches.push(clipContainer);
      }
    });
  });

  return matches;
}

export function resolveClickTimeSec(
  container: HTMLElement,
  samplesPerPixel: number,
  sampleRate: number,
  clientX: number,
): number | null {
  const playlistRoot =
    container.querySelector('[data-playlist-state="ready"]') ??
    container.querySelector('[data-playlist-state="loading"]');
  const scrollContainer =
    playlistRoot instanceof HTMLElement
      ? playlistRoot.querySelector('[data-scroll-container="true"]')
      : container.querySelector('[data-scroll-container="true"]');

  if (!(scrollContainer instanceof HTMLElement)) {
    return null;
  }

  const rect = scrollContainer.getBoundingClientRect();
  const x = clientX - rect.left + scrollContainer.scrollLeft;

  if (x < 0 || sampleRate <= 0 || samplesPerPixel <= 0) {
    return null;
  }

  return (x * samplesPerPixel) / sampleRate;
}

export function applyClipRegionLabels(
  container: HTMLElement,
  tracks: ClipTrack[],
  labelByRegionId: Map<string, string>,
): void {
  tracks.forEach((track, trackIndex) => {
    track.clips.forEach((clip, clipIndex) => {
      const parsed = parseTimelineClipId(clip.id);

      if (!parsed) {
        return;
      }

      const label = labelByRegionId.get(parsed.regionId);

      if (!label) {
        return;
      }

      const clipContainer = resolveClipContainerByIndex(container, tracks, trackIndex, clipIndex);

      if (!clipContainer) {
        return;
      }

      const header = clipContainer.querySelector("[data-clip-id]");

      if (!(header instanceof HTMLElement)) {
        return;
      }

      const textTarget = header.querySelector("span");

      if (!(textTarget instanceof HTMLElement)) {
        return;
      }

      if (textTarget.textContent === label) {
        return;
      }

      textTarget.textContent = label;
      header.setAttribute("title", label);
    });
  });
}

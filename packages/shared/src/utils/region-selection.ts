import type { EditOperation, SongRegionDto } from "../types/music-editor.js";

export const RANGE_EDGE_PADDING_MS = 100;
export const MIN_RANGE_DELETE_MS = 100;
export const TIMELINE_SELECTION_COLLAPSE_SEC = 0.05;

const CLIP_LAYOUT_GAP_MS = 60;

interface RegionLayoutRange {
  regionId: string;
  layoutStartMs: number;
  layoutEndMs: number;
}

function sortRegions(regions: SongRegionDto[]): SongRegionDto[] {
  return regions.slice().sort((left, right) => left.orderIndex - right.orderIndex);
}

function resolveTrackRegions(
  regions: SongRegionDto[],
  operations: EditOperation[],
): SongRegionDto[] {
  const trackRegions = sortRegions(regions).map((region) => ({ ...region }));

  for (const operation of operations) {
    if (!("trackId" in operation)) {
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
      const fromIndex = trackRegions.findIndex(
        (item) => item.id === operation.regionId,
      );

      if (fromIndex < 0) {
        continue;
      }

      const targetIndex = Math.min(operation.targetIndex, trackRegions.length - 1);
      const [moved] = trackRegions.splice(fromIndex, 1);
      trackRegions.splice(targetIndex, 0, moved);
      trackRegions.forEach((region, index) => {
        region.orderIndex = index;
      });
    }
  }

  return trackRegions;
}

function buildRegionLayoutRanges(
  regions: SongRegionDto[],
  operations: EditOperation[],
): RegionLayoutRange[] {
  const trackRegions = resolveTrackRegions(regions, operations);
  let cursorMs = 0;

  return trackRegions.map((region) => {
    const durationMs = Math.max(region.endMs - region.startMs, 100);
    const layoutStartMs = cursorMs;
    const layoutEndMs = cursorMs + durationMs;

    cursorMs = layoutEndMs + CLIP_LAYOUT_GAP_MS;

    return {
      regionId: region.id,
      layoutStartMs,
      layoutEndMs,
    };
  });
}

export function computeRegionLayoutRangeMs(
  regions: SongRegionDto[],
  operations: EditOperation[],
  regionId: string,
): { layoutStartMs: number; layoutEndMs: number } | null {
  const match = buildRegionLayoutRanges(regions, operations).find(
    (item) => item.regionId === regionId,
  );

  if (!match) {
    return null;
  }

  return {
    layoutStartMs: match.layoutStartMs,
    layoutEndMs: match.layoutEndMs,
  };
}

export function findRegionAtLayoutMs(
  regions: SongRegionDto[],
  operations: EditOperation[],
  layoutMs: number,
): RegionLayoutRange | null {
  for (const range of buildRegionLayoutRanges(regions, operations)) {
    if (layoutMs >= range.layoutStartMs && layoutMs < range.layoutEndMs) {
      return range;
    }
  }

  return null;
}

export function layoutMsToSourceMs(
  region: SongRegionDto,
  layoutStartMs: number,
  layoutEndMs: number,
  layoutMs: number,
): number {
  const layoutDurationMs = layoutEndMs - layoutStartMs;
  const sourceDurationMs = region.endMs - region.startMs;
  const ratio = (layoutMs - layoutStartMs) / layoutDurationMs;

  return Math.round(region.startMs + ratio * sourceDurationMs);
}

export function resolveSplitAtMsFromLayoutPlayhead(
  region: SongRegionDto,
  layoutStartMs: number,
  layoutEndMs: number,
  playheadLayoutMs: number,
): { splitAtMs: number } | { error: string } {
  const layoutDurationMs = layoutEndMs - layoutStartMs;
  const sourceDurationMs = region.endMs - region.startMs;

  if (layoutDurationMs <= 0 || sourceDurationMs <= 0) {
    return { error: "Region is too short for split" };
  }

  if (playheadLayoutMs <= layoutStartMs || playheadLayoutMs >= layoutEndMs) {
    return {
      error: "Playhead must be inside the selected region on the timeline",
    };
  }

  const ratio = (playheadLayoutMs - layoutStartMs) / layoutDurationMs;
  const splitAtMs = Math.round(region.startMs + ratio * sourceDurationMs);

  if (
    splitAtMs <= region.startMs + RANGE_EDGE_PADDING_MS ||
    splitAtMs >= region.endMs - RANGE_EDGE_PADDING_MS
  ) {
    return {
      error: "Playhead is too close to the region edge for split",
    };
  }

  return { splitAtMs };
}

export function resolveSplitAtMsForEditor(
  regions: SongRegionDto[],
  operations: EditOperation[],
  region: SongRegionDto,
  playheadLayoutMs: number,
): { splitAtMs: number } | { error: string } {
  const layout = computeRegionLayoutRangeMs(regions, operations, region.id);

  if (!layout) {
    return { error: "Unable to resolve region layout on timeline" };
  }

  return resolveSplitAtMsFromLayoutPlayhead(
    region,
    layout.layoutStartMs,
    layout.layoutEndMs,
    playheadLayoutMs,
  );
}

export type DeleteRangeResolution =
  | { fullRegion: true }
  | { fullRegion: false; startMs: number; endMs: number };

export function resolveSourceRangeForLayoutSelection(
  region: SongRegionDto,
  layoutStartMs: number,
  layoutEndMs: number,
  selectionStartLayoutMs: number,
  selectionEndLayoutMs: number,
): { startMs: number; endMs: number } | { fullRegion: true } | { error: string } {
  const selectionMinLayoutMs = Math.min(selectionStartLayoutMs, selectionEndLayoutMs);
  const selectionMaxLayoutMs = Math.max(selectionStartLayoutMs, selectionEndLayoutMs);
  const clippedMinLayoutMs = Math.max(selectionMinLayoutMs, layoutStartMs);
  const clippedMaxLayoutMs = Math.min(selectionMaxLayoutMs, layoutEndMs);

  if (clippedMaxLayoutMs - clippedMinLayoutMs < MIN_RANGE_DELETE_MS) {
    return { error: "Selection is too short or outside the region" };
  }

  const startMs = layoutMsToSourceMs(
    region,
    layoutStartMs,
    layoutEndMs,
    clippedMinLayoutMs,
  );
  const endMs = layoutMsToSourceMs(
    region,
    layoutStartMs,
    layoutEndMs,
    clippedMaxLayoutMs,
  );

  if (endMs - startMs < MIN_RANGE_DELETE_MS) {
    return { error: "Selected range is too short" };
  }

  const coversFullRegion =
    startMs <= region.startMs + RANGE_EDGE_PADDING_MS &&
    endMs >= region.endMs - RANGE_EDGE_PADDING_MS;

  if (coversFullRegion) {
    return { fullRegion: true };
  }

  return { startMs, endMs };
}

export function resolveSourceRangeForEditor(
  regions: SongRegionDto[],
  operations: EditOperation[],
  region: SongRegionDto,
  selectionStartLayoutMs: number,
  selectionEndLayoutMs: number,
): { startMs: number; endMs: number } | { fullRegion: true } | { error: string } {
  const layout = computeRegionLayoutRangeMs(regions, operations, region.id);

  if (!layout) {
    return { error: "Unable to resolve region layout on timeline" };
  }

  return resolveSourceRangeForLayoutSelection(
    region,
    layout.layoutStartMs,
    layout.layoutEndMs,
    selectionStartLayoutMs,
    selectionEndLayoutMs,
  );
}

export function resolveDeleteRangeFromLayoutSelection(
  region: SongRegionDto,
  layoutStartMs: number,
  layoutEndMs: number,
  selectionStartLayoutMs: number,
  selectionEndLayoutMs: number,
): DeleteRangeResolution | { error: string } {
  const selectionMinLayoutMs = Math.min(selectionStartLayoutMs, selectionEndLayoutMs);
  const selectionMaxLayoutMs = Math.max(selectionStartLayoutMs, selectionEndLayoutMs);
  const clippedMinLayoutMs = Math.max(selectionMinLayoutMs, layoutStartMs);
  const clippedMaxLayoutMs = Math.min(selectionMaxLayoutMs, layoutEndMs);

  if (clippedMaxLayoutMs - clippedMinLayoutMs < MIN_RANGE_DELETE_MS) {
    return { error: "Selection is too short or outside the region" };
  }

  const startMs = layoutMsToSourceMs(
    region,
    layoutStartMs,
    layoutEndMs,
    clippedMinLayoutMs,
  );
  const endMs = layoutMsToSourceMs(
    region,
    layoutStartMs,
    layoutEndMs,
    clippedMaxLayoutMs,
  );

  if (endMs - startMs < MIN_RANGE_DELETE_MS) {
    return { error: "Selected range is too short to delete" };
  }

  const coversFullRegion =
    startMs <= region.startMs + RANGE_EDGE_PADDING_MS &&
    endMs >= region.endMs - RANGE_EDGE_PADDING_MS;

  if (coversFullRegion) {
    return { fullRegion: true };
  }

  const removesFromStart =
    startMs <= region.startMs + RANGE_EDGE_PADDING_MS &&
    endMs < region.endMs - RANGE_EDGE_PADDING_MS;
  const removesFromEnd =
    endMs >= region.endMs - RANGE_EDGE_PADDING_MS &&
    startMs > region.startMs + RANGE_EDGE_PADDING_MS;
  const removesMiddle =
    startMs > region.startMs + RANGE_EDGE_PADDING_MS &&
    endMs < region.endMs - RANGE_EDGE_PADDING_MS;

  if (!removesFromStart && !removesFromEnd && !removesMiddle) {
    return { error: "Selection is too close to the region edge" };
  }

  if (removesFromStart && endMs >= region.endMs - RANGE_EDGE_PADDING_MS) {
    return { error: "Selection is too close to the region edge" };
  }

  if (removesFromEnd && startMs <= region.startMs + RANGE_EDGE_PADDING_MS) {
    return { error: "Selection is too close to the region edge" };
  }

  return { fullRegion: false, startMs, endMs };
}

export function resolveDeleteRangeForEditor(
  regions: SongRegionDto[],
  operations: EditOperation[],
  region: SongRegionDto,
  selectionStartLayoutMs: number,
  selectionEndLayoutMs: number,
): DeleteRangeResolution | { error: string } {
  const layout = computeRegionLayoutRangeMs(regions, operations, region.id);

  if (!layout) {
    return { error: "Unable to resolve region layout on timeline" };
  }

  return resolveDeleteRangeFromLayoutSelection(
    region,
    layout.layoutStartMs,
    layout.layoutEndMs,
    selectionStartLayoutMs,
    selectionEndLayoutMs,
  );
}

export function isTimelineRangeSelection(
  selectionStartSec: number,
  selectionEndSec: number,
): boolean {
  return (
    Math.abs(selectionEndSec - selectionStartSec) > TIMELINE_SELECTION_COLLAPSE_SEC
  );
}

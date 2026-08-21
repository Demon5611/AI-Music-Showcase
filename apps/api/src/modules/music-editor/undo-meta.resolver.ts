import type { EditOperation } from "@ai-music/shared";
import { prisma } from "@ai-music/db";

export interface OperationUndoMeta {
  previousStartMs?: number;
  previousEndMs?: number;
  duplicatedRegionId?: string;
  deleteRegionSnapshot?: {
    id?: string;
    label: string;
    startMs: number;
    endMs: number;
    orderIndex: number;
    replacementAudioKey?: string | null;
  };
  /** @deprecated Renamed to deleteRegionSnapshot. */
  cutRegionSnapshot?: OperationUndoMeta["deleteRegionSnapshot"];
  previousIndex?: number;
  deleteRangeUndo?: {
    kind: "trim_start" | "trim_end" | "middle";
    previousStartMs?: number;
    previousEndMs?: number;
    leftRegionId?: string;
    rightRegionId?: string;
    mergedEndMs?: number;
    tailStartMs?: number;
    deletedMiddleRegionId?: string;
  };
}

export function resolveDeleteRegionSnapshot(
  undoMeta?: OperationUndoMeta,
): OperationUndoMeta["deleteRegionSnapshot"] | undefined {
  return undoMeta?.deleteRegionSnapshot ?? undoMeta?.cutRegionSnapshot;
}

export type StoredEditOperation = EditOperation & {
  undoMeta?: OperationUndoMeta;
};

export async function resolveDuplicatedRegionId(
  songId: string,
  regionId: string,
  undoMeta?: OperationUndoMeta,
): Promise<string | null> {
  if (undoMeta?.duplicatedRegionId) {
    return undoMeta.duplicatedRegionId;
  }

  const source = await prisma.songRegion.findUnique({
    where: { id: regionId },
  });

  if (!source) {
    return null;
  }

  const candidates = await prisma.songRegion.findMany({
    where: {
      songId,
      id: { not: regionId },
      startMs: source.startMs,
      endMs: source.endMs,
    },
    orderBy: { createdAt: "desc" },
  });

  const adjacentDuplicate = candidates.find(
    (candidate) => candidate.orderIndex === source.orderIndex + 1,
  );

  return adjacentDuplicate?.id ?? candidates[0]?.id ?? null;
}

export async function resolveSplitPreviousEndMs(
  songId: string,
  splitAtMs: number,
  undoMeta?: OperationUndoMeta,
): Promise<number | undefined> {
  if (undoMeta?.previousEndMs !== undefined) {
    return undoMeta.previousEndMs;
  }

  const splitRegion = await prisma.songRegion.findFirst({
    where: { songId, startMs: splitAtMs },
  });

  return splitRegion?.endMs;
}

export async function resolveMovePreviousIndex(
  undoMeta?: OperationUndoMeta,
): Promise<number | undefined> {
  return undoMeta?.previousIndex;
}

export async function resolveResizeBounds(
  regionId: string,
  undoMeta?: OperationUndoMeta,
): Promise<{ startMs: number; endMs: number } | null> {
  if (
    undoMeta?.previousStartMs !== undefined &&
    undoMeta.previousEndMs !== undefined
  ) {
    return {
      startMs: undoMeta.previousStartMs,
      endMs: undoMeta.previousEndMs,
    };
  }

  return null;
}

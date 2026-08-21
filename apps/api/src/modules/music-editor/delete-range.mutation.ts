import type { DeleteRangeOperation } from "@ai-music/shared";
import { MIN_RANGE_DELETE_MS, RANGE_EDGE_PADDING_MS } from "@ai-music/shared";
import type { Prisma } from "@ai-music/db";
import { prisma } from "@ai-music/db";
import { BadRequestError, NotFoundError } from "../../common/errors.js";
import type { OperationUndoMeta } from "./undo-meta.resolver.js";

type PrismaClientOrTransaction = typeof prisma | Prisma.TransactionClient;

async function reindexRegions(
  songId: string,
  db: PrismaClientOrTransaction,
): Promise<void> {
  const regions = await db.songRegion.findMany({
    where: { songId },
    orderBy: [{ orderIndex: "asc" }, { startMs: "asc" }],
  });

  await Promise.all(
    regions.map((region, index) =>
      db.songRegion.update({
        where: { id: region.id },
        data: { orderIndex: index },
      }),
    ),
  );
}

async function splitRegionAt(
  songId: string,
  regionId: string,
  splitAtMs: number,
  db: PrismaClientOrTransaction,
): Promise<{ leftRegionId: string; rightRegionId: string }> {
  const region = await db.songRegion.findUnique({ where: { id: regionId } });

  if (!region || region.songId !== songId) {
    throw new NotFoundError("Region not found");
  }

  if (splitAtMs <= region.startMs || splitAtMs >= region.endMs) {
    throw new BadRequestError("splitAtMs must be inside the region");
  }

  const created = await db.songRegion.create({
    data: {
      songId,
      label: "custom",
      startMs: splitAtMs,
      endMs: region.endMs,
      orderIndex: region.orderIndex + 1,
    },
  });

  await db.songRegion.update({
    where: { id: region.id },
    data: {
      endMs: splitAtMs,
      label: "custom",
    },
  });

  await reindexRegions(songId, db);

  return { leftRegionId: region.id, rightRegionId: created.id };
}

function assertValidDeleteRange(
  regionStartMs: number,
  regionEndMs: number,
  startMs: number,
  endMs: number,
): void {
  if (endMs - startMs < MIN_RANGE_DELETE_MS) {
    throw new BadRequestError("Selected range is too short to delete");
  }

  if (startMs < regionStartMs || endMs > regionEndMs) {
    throw new BadRequestError("Delete range must be inside the region");
  }

  const coversFullRegion =
    startMs <= regionStartMs + RANGE_EDGE_PADDING_MS &&
    endMs >= regionEndMs - RANGE_EDGE_PADDING_MS;

  if (coversFullRegion) {
    throw new BadRequestError("Use DELETE_REGION for full region removal");
  }
}

export async function applyDeleteRangeMutation(
  songId: string,
  operation: DeleteRangeOperation,
  db: PrismaClientOrTransaction = prisma,
): Promise<OperationUndoMeta> {
  const region = await db.songRegion.findUnique({
    where: { id: operation.regionId },
  });

  if (!region || region.songId !== songId) {
    throw new NotFoundError("Region not found");
  }

  const { startMs, endMs } = operation;
  assertValidDeleteRange(region.startMs, region.endMs, startMs, endMs);

  const removesFromStart =
    startMs <= region.startMs + RANGE_EDGE_PADDING_MS &&
    endMs < region.endMs - RANGE_EDGE_PADDING_MS;
  const removesFromEnd =
    endMs >= region.endMs - RANGE_EDGE_PADDING_MS &&
    startMs > region.startMs + RANGE_EDGE_PADDING_MS;

  if (removesFromStart) {
    await db.songRegion.update({
      where: { id: region.id },
      data: {
        startMs: endMs,
        label: "custom",
      },
    });

    return {
      deleteRangeUndo: {
        kind: "trim_start",
        previousStartMs: region.startMs,
      },
    };
  }

  if (removesFromEnd) {
    await db.songRegion.update({
      where: { id: region.id },
      data: {
        endMs: startMs,
        label: "custom",
      },
    });

    return {
      deleteRangeUndo: {
        kind: "trim_end",
        previousEndMs: region.endMs,
      },
    };
  }

  if (
    startMs <= region.startMs + RANGE_EDGE_PADDING_MS ||
    endMs >= region.endMs - RANGE_EDGE_PADDING_MS
  ) {
    throw new BadRequestError("Delete range is too close to the region edge");
  }

  const mergedEndMs = region.endMs;
  const { rightRegionId: rangeRegionId } = await splitRegionAt(
    songId,
    region.id,
    startMs,
    db,
  );
  const { leftRegionId: middleRegionId, rightRegionId: tailRegionId } =
    await splitRegionAt(songId, rangeRegionId, endMs, db);

  await db.songRegion.delete({ where: { id: middleRegionId } });
  await reindexRegions(songId, db);

  return {
    deleteRangeUndo: {
      kind: "middle",
      leftRegionId: region.id,
      rightRegionId: tailRegionId,
      mergedEndMs,
      tailStartMs: endMs,
      deletedMiddleRegionId: middleRegionId,
    },
  };
}

async function resolveDeleteRangeTailRegion(
  songId: string,
  rangeUndo: NonNullable<OperationUndoMeta["deleteRangeUndo"]>,
  leftRegionEndMs: number,
  db: PrismaClientOrTransaction,
): Promise<{ id: string } | null> {
  if (
    rangeUndo.rightRegionId &&
    rangeUndo.rightRegionId !== rangeUndo.deletedMiddleRegionId
  ) {
    const tailById = await db.songRegion.findUnique({
      where: { id: rangeUndo.rightRegionId },
    });

    if (tailById) {
      return tailById;
    }
  }

  if (rangeUndo.tailStartMs !== undefined) {
    const tailByStart = await db.songRegion.findFirst({
      where: {
        songId,
        startMs: rangeUndo.tailStartMs,
      },
    });

    if (tailByStart) {
      return tailByStart;
    }
  }

  if (rangeUndo.mergedEndMs !== undefined) {
    return db.songRegion.findFirst({
      where: {
        songId,
        startMs: leftRegionEndMs,
        endMs: rangeUndo.mergedEndMs,
      },
    });
  }

  return null;
}

export async function reverseDeleteRangeMutation(
  songId: string,
  operation: DeleteRangeOperation,
  undoMeta: OperationUndoMeta | undefined,
  db: PrismaClientOrTransaction = prisma,
): Promise<void> {
  const rangeUndo = undoMeta?.deleteRangeUndo;

  if (!rangeUndo) {
    throw new BadRequestError("Cannot undo delete range: missing metadata");
  }

  if (rangeUndo.kind === "trim_start") {
    if (rangeUndo.previousStartMs === undefined) {
      throw new BadRequestError("Cannot undo delete range: missing start metadata");
    }

    await db.songRegion.update({
      where: { id: operation.regionId },
      data: { startMs: rangeUndo.previousStartMs },
    });
    return;
  }

  if (rangeUndo.kind === "trim_end") {
    if (rangeUndo.previousEndMs === undefined) {
      throw new BadRequestError("Cannot undo delete range: missing end metadata");
    }

    await db.songRegion.update({
      where: { id: operation.regionId },
      data: { endMs: rangeUndo.previousEndMs },
    });
    return;
  }

  if (
    !rangeUndo.leftRegionId ||
    rangeUndo.mergedEndMs === undefined
  ) {
    throw new BadRequestError("Cannot undo delete range: missing middle metadata");
  }

  const leftRegion = await db.songRegion.findUnique({
    where: { id: rangeUndo.leftRegionId },
  });

  if (!leftRegion || leftRegion.songId !== songId) {
    throw new BadRequestError("Cannot undo delete range: left region not found");
  }

  const previousLeftEndMs = leftRegion.endMs;
  const tailRegion = await resolveDeleteRangeTailRegion(
    songId,
    rangeUndo,
    previousLeftEndMs,
    db,
  );

  await db.songRegion.update({
    where: { id: rangeUndo.leftRegionId },
    data: { endMs: rangeUndo.mergedEndMs },
  });

  if (tailRegion && tailRegion.id !== rangeUndo.leftRegionId) {
    await db.songRegion.delete({ where: { id: tailRegion.id } });
  }

  await reindexRegions(songId, db);
}

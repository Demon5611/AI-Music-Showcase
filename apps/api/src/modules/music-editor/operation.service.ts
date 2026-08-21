import type { EditOperation, EditorTrackId } from "@ai-music/shared";
import { prisma, Prisma } from "@ai-music/db";
import { BadRequestError, NotFoundError } from "../../common/errors.js";
import { assertEditorOperation, assertFeature, assertVersionHistory, assertVersionHistoryOperationLimit } from "../billing/entitlements.service.js";
import {
  countActiveOperations,
  findLastActiveOperation,
  findLastUndoneOperation,
} from "./edit-operation.repository.js";
import { getCurrentVersion, getSongForUser } from "./song-editor.service.js";
import {
  resolveDeleteRegionSnapshot,
  resolveDuplicatedRegionId,
  resolveMovePreviousIndex,
  resolveResizeBounds,
  resolveSplitPreviousEndMs,
  type OperationUndoMeta,
  type StoredEditOperation,
} from "./undo-meta.resolver.js";
import { applyDeleteRangeMutation, reverseDeleteRangeMutation } from "./delete-range.mutation.js";

interface SelectionContext {
  selectedRegionId?: string | null;
  selectedTrackId?: EditorTrackId | null;
}

interface UndoLogContext {
  info: (payload: Record<string, unknown>, message: string) => void;
  warn: (payload: Record<string, unknown>, message: string) => void;
}

const noopLogger: UndoLogContext = {
  info: () => undefined,
  warn: () => undefined,
};

const MIN_REGION_LENGTH_MS = 100;

type PrismaClientOrTransaction = typeof prisma | Prisma.TransactionClient;

function resolveOperationType(type: string): string {
  return type === "CUT_REGION" ? "DELETE_REGION" : type;
}

function normalizeStoredEditOperation(operation: StoredEditOperation): StoredEditOperation {
  if ((operation.type as string) !== "CUT_REGION") {
    return operation;
  }

  return {
    ...operation,
    type: "DELETE_REGION",
  } as StoredEditOperation;
}

function isRegionMutation(operation: EditOperation | StoredEditOperation): boolean {
  return [
    "DELETE_REGION",
    "DELETE_RANGE",
    "SPLIT_REGION",
    "MOVE_REGION",
    "DUPLICATE_REGION",
    "RESIZE_REGION",
  ].includes(resolveOperationType(operation.type));
}

function assertValidResizeBounds(
  startMs: number,
  endMs: number,
  songDurationMs: number | null,
): void {
  if (endMs - startMs < MIN_REGION_LENGTH_MS) {
    throw new BadRequestError(`Region must be at least ${MIN_REGION_LENGTH_MS}ms long`);
  }

  if (songDurationMs !== null && endMs > songDurationMs) {
    throw new BadRequestError("Region end exceeds song duration");
  }
}

const TRACK_MIX_OPERATION_TYPES = new Set<EditOperation["type"]>([
  "SET_VOLUME",
  "MUTE_TRACK",
  "SOLO_TRACK",
  "FADE",
  "APPLY_VOICE_PRESET",
]);

export function validateOperationSelection(
  operation: EditOperation,
  context: SelectionContext,
): void {
  if (operation.type === "MUTE_TRACK") {
    return;
  }

  const { selectedRegionId, selectedTrackId } = context;

  if (selectedRegionId && "regionId" in operation && operation.regionId) {
    if (operation.regionId !== selectedRegionId) {
      throw new BadRequestError(
        "Operation cannot modify a region outside the current selection",
        "SELECTION_MISMATCH",
      );
    }
  }

  if (selectedTrackId && "trackId" in operation && !TRACK_MIX_OPERATION_TYPES.has(operation.type)) {
    if (operation.trackId !== selectedTrackId) {
      throw new BadRequestError(
        "Operation cannot modify a track outside the current selection",
        "SELECTION_MISMATCH",
      );
    }
  }
}

async function reindexRegions(
  songId: string,
  db: PrismaClientOrTransaction = prisma,
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

async function restoreDeletedRegionAtIndex(
  songId: string,
  snapshot: NonNullable<OperationUndoMeta["deleteRegionSnapshot"]>,
  regionId: string,
  db: PrismaClientOrTransaction,
): Promise<void> {
  const existingRegions = await db.songRegion.findMany({
    where: { songId },
    orderBy: [{ orderIndex: "asc" }, { startMs: "asc" }],
    select: { id: true },
  });
  const insertIndex = Math.min(Math.max(snapshot.orderIndex, 0), existingRegions.length);

  await db.songRegion.create({
    data: {
      id: regionId,
      songId,
      label: snapshot.label,
      startMs: snapshot.startMs,
      endMs: snapshot.endMs,
      orderIndex: insertIndex,
      replacementAudioKey: snapshot.replacementAudioKey ?? null,
    },
  });

  const orderedRegionIds = existingRegions.map((region) => region.id);
  orderedRegionIds.splice(insertIndex, 0, regionId);

  await Promise.all(
    orderedRegionIds.map((id, orderIndex) =>
      db.songRegion.update({
        where: { id },
        data: { orderIndex },
      }),
    ),
  );
}

function buildUndoMeta(
  operation: EditOperation,
  regions: Awaited<ReturnType<typeof prisma.songRegion.findMany>>,
): OperationUndoMeta | undefined {
  const regionMap = new Map(regions.map((region) => [region.id, region]));

  switch (operation.type) {
    case "DELETE_REGION": {
      const region = regionMap.get(operation.regionId);

      if (!region) {
        return undefined;
      }

      return {
        deleteRegionSnapshot: {
          id: region.id,
          label: region.label,
          startMs: region.startMs,
          endMs: region.endMs,
          orderIndex: region.orderIndex,
          replacementAudioKey: region.replacementAudioKey,
        },
      };
    }

    case "SPLIT_REGION": {
      const region = regionMap.get(operation.regionId);

      if (!region) {
        return undefined;
      }

      return { previousEndMs: region.endMs };
    }

    case "MOVE_REGION": {
      const sorted = regions.slice().sort((a, b) => a.orderIndex - b.orderIndex);
      const previousIndex = sorted.findIndex((item) => item.id === operation.regionId);

      if (previousIndex < 0) {
        return undefined;
      }

      return { previousIndex };
    }

    case "RESIZE_REGION": {
      const region = regionMap.get(operation.regionId);

      if (!region) {
        return undefined;
      }

      return {
        previousStartMs: region.startMs,
        previousEndMs: region.endMs,
      };
    }

    default:
      return undefined;
  }
}

export async function applyRegionMutation(
  songId: string,
  operation: EditOperation,
  db: PrismaClientOrTransaction = prisma,
): Promise<OperationUndoMeta | undefined> {
  const regions = await db.songRegion.findMany({
    where: { songId },
    orderBy: { orderIndex: "asc" },
  });

  const undoMeta = buildUndoMeta(operation, regions);
  const regionMap = new Map(regions.map((region) => [region.id, region]));

  switch (operation.type) {
    case "DELETE_REGION": {
      const region = regionMap.get(operation.regionId);

      if (!region) {
        throw new NotFoundError("Region not found");
      }

      await db.songRegion.delete({ where: { id: region.id } });
      await reindexRegions(songId, db);
      return undoMeta;
    }

    case "DELETE_RANGE": {
      return applyDeleteRangeMutation(songId, operation, db);
    }

    case "SPLIT_REGION": {
      const region = regionMap.get(operation.regionId);

      if (!region) {
        throw new NotFoundError("Region not found");
      }

      if (operation.splitAtMs <= region.startMs || operation.splitAtMs >= region.endMs) {
        throw new BadRequestError("splitAtMs must be inside the region");
      }

      await db.songRegion.update({
        where: { id: region.id },
        data: {
          endMs: operation.splitAtMs,
          label: "custom",
        },
      });

      await db.songRegion.create({
        data: {
          songId,
          label: "custom",
          startMs: operation.splitAtMs,
          endMs: region.endMs,
          orderIndex: region.orderIndex + 1,
        },
      });

      await reindexRegions(songId, db);
      return undoMeta;
    }

    case "MOVE_REGION": {
      const sorted = regions.slice().sort((a, b) => a.orderIndex - b.orderIndex);
      const fromIndex = sorted.findIndex((item) => item.id === operation.regionId);

      if (fromIndex < 0) {
        throw new NotFoundError("Region not found");
      }

      const targetIndex = Math.min(operation.targetIndex, sorted.length - 1);
      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(targetIndex, 0, moved);

      await Promise.all(
        sorted.map((region, index) =>
          db.songRegion.update({
            where: { id: region.id },
            data: { orderIndex: index },
          }),
        ),
      );
      return undoMeta;
    }

    case "DUPLICATE_REGION": {
      const region = regionMap.get(operation.regionId);

      if (!region) {
        throw new NotFoundError("Region not found");
      }

      const duplicated = await db.songRegion.create({
        data: {
          songId,
          label: region.label,
          startMs: region.startMs,
          endMs: region.endMs,
          orderIndex: region.orderIndex + 1,
        },
      });

      await reindexRegions(songId, db);
      return { duplicatedRegionId: duplicated.id };
    }

    case "RESIZE_REGION": {
      const region = regionMap.get(operation.regionId);

      if (!region) {
        throw new NotFoundError("Region not found");
      }

      const song = await db.song.findUnique({ where: { id: songId } });

      assertValidResizeBounds(operation.startMs, operation.endMs, song?.durationMs ?? null);

      await db.songRegion.update({
        where: { id: region.id },
        data: {
          startMs: operation.startMs,
          endMs: operation.endMs,
          label: "custom",
        },
      });

      return undoMeta;
    }

    default:
      return undefined;
  }
}

export async function reverseRegionMutation(
  songId: string,
  operation: StoredEditOperation,
  log: UndoLogContext = noopLogger,
  db: PrismaClientOrTransaction = prisma,
): Promise<void> {
  const normalizedOperation = normalizeStoredEditOperation(operation);
  const undoMeta = normalizedOperation.undoMeta;

  switch (normalizedOperation.type) {
    case "DELETE_REGION": {
      const deleteRegionSnapshot = resolveDeleteRegionSnapshot(undoMeta);

      if (!deleteRegionSnapshot) {
        log.warn(
          {
            songId,
            operationType: normalizedOperation.type,
            regionId: normalizedOperation.regionId,
          },
          "undo: skipped region reversal, missing delete snapshot",
        );
        throw new BadRequestError("Cannot undo delete: missing region snapshot");
      }

      const restoredRegionId = deleteRegionSnapshot.id ?? normalizedOperation.regionId;

      await restoreDeletedRegionAtIndex(songId, deleteRegionSnapshot, restoredRegionId, db);
      return;
    }

    case "DELETE_RANGE": {
      await reverseDeleteRangeMutation(songId, normalizedOperation, undoMeta, db);
      return;
    }

    case "SPLIT_REGION": {
      const previousEndMs = await resolveSplitPreviousEndMs(
        songId,
        normalizedOperation.splitAtMs,
        undoMeta,
      );

      if (previousEndMs === undefined) {
        log.warn(
          {
            songId,
            operationType: normalizedOperation.type,
            regionId: normalizedOperation.regionId,
          },
          "undo: skipped region reversal, missing split metadata",
        );
        throw new BadRequestError("Cannot undo split: missing split metadata");
      }

      const splitRegion = await db.songRegion.findFirst({
        where: {
          songId,
          startMs: normalizedOperation.splitAtMs,
        },
      });

      if (splitRegion) {
        await db.songRegion.delete({ where: { id: splitRegion.id } });
      }

      await db.songRegion.update({
        where: { id: normalizedOperation.regionId },
        data: { endMs: previousEndMs },
      });
      await reindexRegions(songId, db);
      return;
    }

    case "MOVE_REGION": {
      const previousIndex = await resolveMovePreviousIndex(undoMeta);

      if (previousIndex === undefined) {
        log.warn(
          {
            songId,
            operationType: normalizedOperation.type,
            regionId: normalizedOperation.regionId,
            targetIndex: normalizedOperation.targetIndex,
          },
          "undo: skipped region reversal, missing move metadata",
        );
        throw new BadRequestError("Cannot undo move: missing move metadata");
      }

      await applyRegionMutation(
        songId,
        {
          type: "MOVE_REGION",
          regionId: normalizedOperation.regionId,
          targetIndex: previousIndex,
        },
        db,
      );
      return;
    }

    case "DUPLICATE_REGION": {
      const duplicatedRegionId = await resolveDuplicatedRegionId(
        songId,
        normalizedOperation.regionId,
        undoMeta,
      );

      if (!duplicatedRegionId) {
        log.warn(
          {
            songId,
            operationType: normalizedOperation.type,
            regionId: normalizedOperation.regionId,
          },
          "undo: skipped region reversal, duplicate region not found",
        );
        throw new BadRequestError("Cannot undo duplicate: duplicated region not found");
      }

      await db.songRegion.delete({
        where: { id: duplicatedRegionId },
      });
      await reindexRegions(songId, db);
      return;
    }

    case "RESIZE_REGION": {
      const previousBounds = await resolveResizeBounds(normalizedOperation.regionId, undoMeta);

      if (!previousBounds) {
        log.warn(
          {
            songId,
            operationType: normalizedOperation.type,
            regionId: normalizedOperation.regionId,
          },
          "undo: skipped region reversal, missing resize metadata",
        );
        throw new BadRequestError("Cannot undo resize: missing resize metadata");
      }

      await db.songRegion.update({
        where: { id: normalizedOperation.regionId },
        data: {
          startMs: previousBounds.startMs,
          endMs: previousBounds.endMs,
        },
      });
      return;
    }

    default:
      return;
  }
}

export async function applyOperation(
  userId: string,
  songId: string,
  operation: EditOperation,
  context: SelectionContext,
) {
  if (operation.type === "APPLY_VOICE_PRESET") {
    await assertFeature(userId, "voicePresets");

    if (operation.trackId !== "vocal") {
      throw new BadRequestError("Voice presets apply only to the vocal track");
    }
  } else {
    await assertEditorOperation(userId, operation.type);
  }

  validateOperationSelection(operation, context);

  const song = await getSongForUser(userId, songId);

  if (song.status !== "ready") {
    throw new BadRequestError("Song editor is not ready yet");
  }

  if ("regionId" in operation && operation.regionId) {
    const regionExists = song.regions.some((region) => region.id === operation.regionId);

    if (!regionExists) {
      throw new NotFoundError("Region not found");
    }
  }

  if (operation.type === "RESIZE_REGION" || operation.type === "RESIZE_TRACK_REGION") {
    assertValidResizeBounds(operation.startMs, operation.endMs, song.durationMs);
  }

  const version = await getCurrentVersion(songId);

  await prisma.$transaction(async (tx) => {
    const activeOperationCount = await tx.editOperation.count({
      where: {
        songVersionId: version.id,
        undoneAt: null,
      },
    });

    await assertVersionHistoryOperationLimit(userId, activeOperationCount);

    const undoMeta = isRegionMutation(operation)
      ? await applyRegionMutation(songId, operation, tx)
      : undefined;

    if (isRegionMutation(operation) && !undoMeta) {
      throw new BadRequestError("Failed to capture undo metadata for operation");
    }

    const storedPayload: StoredEditOperation = isRegionMutation(operation)
      ? { ...operation, undoMeta: undoMeta! }
      : operation;

    await tx.editOperation.deleteMany({
      where: {
        songVersionId: version.id,
        undoneAt: { not: null },
      },
    });

    await tx.editOperation.create({
      data: {
        songVersionId: version.id,
        operationType: operation.type,
        payloadJson: storedPayload as unknown as Prisma.InputJsonValue,
      },
    });
  });

  return getSongForUser(userId, songId);
}

export async function previewOperation(
  userId: string,
  songId: string,
  operation: EditOperation,
  context: SelectionContext,
) {
  validateOperationSelection(operation, context);

  const song = await getSongForUser(userId, songId);

  if ("regionId" in operation && operation.regionId) {
    const regionExists = song.regions.some((region) => region.id === operation.regionId);

    if (!regionExists) {
      throw new NotFoundError("Region not found");
    }
  }

  if (operation.type === "RESIZE_REGION" || operation.type === "RESIZE_TRACK_REGION") {
    assertValidResizeBounds(operation.startMs, operation.endMs, song.durationMs);
  }

  return {
    valid: true,
    operation,
    songId: song.id,
  };
}

export async function undoLastOperation(
  userId: string,
  songId: string,
  log: UndoLogContext = noopLogger,
) {
  await assertVersionHistory(userId);

  const song = await getSongForUser(userId, songId);

  if (song.status !== "ready") {
    throw new BadRequestError("Song editor is not ready yet");
  }

  const version = await getCurrentVersion(songId);

  log.info(
    {
      songId,
      versionId: version.id,
      totalOperations: version.operations.length,
      activeOperations: countActiveOperations(version.operations),
    },
    "undo: resolving last active operation",
  );

  const lastOperation = await findLastActiveOperation(version.id);

  if (!lastOperation) {
    log.warn({ songId, versionId: version.id }, "undo: nothing to undo");
    throw new BadRequestError("Nothing to undo");
  }

  const payload = normalizeStoredEditOperation(
    lastOperation.payloadJson as unknown as StoredEditOperation,
  );

  log.info(
    {
      songId,
      operationId: lastOperation.id,
      operationType: lastOperation.operationType,
      hasUndoMeta: Boolean(payload.undoMeta),
    },
    "undo: reversing operation",
  );

  await prisma.$transaction(async (tx) => {
    if (isRegionMutation(payload)) {
      await reverseRegionMutation(songId, payload, log, tx);
    }

    await tx.editOperation.update({
      where: { id: lastOperation.id },
      data: { undoneAt: new Date() },
    });
  });

  log.info({ songId, operationId: lastOperation.id }, "undo: operation marked as undone");

  return getSongForUser(userId, songId);
}

export async function redoLastOperation(userId: string, songId: string) {
  await assertVersionHistory(userId);

  const song = await getSongForUser(userId, songId);

  if (song.status !== "ready") {
    throw new BadRequestError("Song editor is not ready yet");
  }

  const version = await getCurrentVersion(songId);

  const lastUndone = await findLastUndoneOperation(version.id);

  if (!lastUndone) {
    throw new BadRequestError("Nothing to redo");
  }

  const payload = normalizeStoredEditOperation(
    lastUndone.payloadJson as unknown as StoredEditOperation,
  );
  const { undoMeta: previousUndoMeta, ...operation } = payload;

  await prisma.$transaction(async (tx) => {
    let nextUndoMeta = previousUndoMeta;

    if (isRegionMutation(operation)) {
      const mutationUndoMeta = await applyRegionMutation(songId, operation, tx);

      if (operation.type === "DUPLICATE_REGION" && mutationUndoMeta) {
        nextUndoMeta = {
          ...previousUndoMeta,
          ...mutationUndoMeta,
        };
      }
    }

    await tx.editOperation.update({
      where: { id: lastUndone.id },
      data: {
        undoneAt: null,
        payloadJson: {
          ...operation,
          undoMeta: nextUndoMeta,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  });

  return getSongForUser(userId, songId);
}

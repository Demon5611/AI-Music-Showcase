import { prisma, Prisma } from "@ai-music/db";
import type { DbEditOperation } from "./song-editor.mapper.js";

export function countActiveOperations(operations: DbEditOperation[]): number {
  return operations.filter((operation) => operation.undoneAt === null).length;
}

export async function clearUndoneOperations(versionId: string): Promise<void> {
  await prisma.editOperation.deleteMany({
    where: {
      songVersionId: versionId,
      undoneAt: { not: null },
    },
  });
}

export async function findLastActiveOperation(
  versionId: string,
): Promise<DbEditOperation | null> {
  return prisma.editOperation.findFirst({
    where: {
      songVersionId: versionId,
      undoneAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function markOperationUndone(operationId: string): Promise<void> {
  await prisma.editOperation.update({
    where: { id: operationId },
    data: { undoneAt: new Date() },
  });
}

export async function findLastUndoneOperation(
  versionId: string,
): Promise<DbEditOperation | null> {
  return prisma.editOperation.findFirst({
    where: {
      songVersionId: versionId,
      undoneAt: { not: null },
    },
    orderBy: { undoneAt: "desc" },
  });
}

export async function restoreUndoneOperation(
  operationId: string,
  payloadJson: Prisma.InputJsonValue,
): Promise<void> {
  await prisma.editOperation.update({
    where: { id: operationId },
    data: {
      undoneAt: null,
      payloadJson,
    },
  });
}

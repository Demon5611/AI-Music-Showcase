import { prisma } from "@ai-music/db";
import { BadRequestError } from "../../common/errors.js";

const MAX_RECORD_IDS = 200;

export type LoadTestSummaryRequest = {
  recordIds: string[];
};

export type LoadTestSummaryResponse = {
  requested: number;
  found: number;
  byStatus: Record<string, number>;
  bySubmissionState: Record<string, number>;
  tracksByPersistence: Record<string, number>;
  recordIds: string[];
};

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/**
 * Read-only aggregates for load-test correctness. No prompt/title/URLs/PII.
 */
export async function getLoadTestSummary(
  input: LoadTestSummaryRequest,
): Promise<LoadTestSummaryResponse> {
  if (!Array.isArray(input.recordIds)) {
    throw new BadRequestError("recordIds must be an array", "INVALID_LOAD_TEST_SUMMARY");
  }

  const uniqueIds = [
    ...new Set(
      input.recordIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];

  if (uniqueIds.length === 0) {
    throw new BadRequestError("recordIds is required", "INVALID_LOAD_TEST_SUMMARY");
  }

  if (uniqueIds.length > MAX_RECORD_IDS) {
    throw new BadRequestError(
      `recordIds limit is ${MAX_RECORD_IDS}`,
      "INVALID_LOAD_TEST_SUMMARY",
    );
  }

  const rows = await prisma.musicGeneration.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      status: true,
      submissionState: true,
      tracks: {
        select: { persistenceState: true },
      },
    },
  });

  const byStatus: Record<string, number> = {};
  const bySubmissionState: Record<string, number> = {};
  const tracksByPersistence: Record<string, number> = {};

  for (const row of rows) {
    bump(byStatus, row.status);
    bump(bySubmissionState, row.submissionState);
    for (const track of row.tracks) {
      bump(tracksByPersistence, track.persistenceState);
    }
  }

  return {
    requested: uniqueIds.length,
    found: rows.length,
    byStatus,
    bySubmissionState,
    tracksByPersistence,
    recordIds: rows.map((row) => row.id),
  };
}

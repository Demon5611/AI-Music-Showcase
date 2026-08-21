import { prisma } from "@ai-music/db";
import {
  logLoadControl,
  VOICE_DELETION_ACTIVE_REQUEST_STATUSES,
} from "@ai-music/shared";
import {
  voiceDeletionOldestPendingSeconds,
  voiceDeletionPendingProviderGauge,
} from "@ai-music/observability";

const DEFAULT_PENDING_WARN_DAYS = 7;

function resolvePendingWarnMs(): number {
  const raw = process.env.VOICE_DELETION_PENDING_WARN_DAYS?.trim();
  const days = raw ? Number(raw) : DEFAULT_PENDING_WARN_DAYS;
  if (!Number.isFinite(days) || days <= 0) {
    return DEFAULT_PENDING_WARN_DAYS * 86_400_000;
  }
  return days * 86_400_000;
}

/**
 * Lightweight reconciliation for manual provider deletions — metrics/logs only.
 * Does not mutate status or call provider APIs.
 */
export async function reconcilePendingVoiceDeletions(): Promise<void> {
  const openRequests = await prisma.providerDataDeletionRequest.findMany({
    where: {
      status: { in: [...VOICE_DELETION_ACTIVE_REQUEST_STATUSES] },
    },
    orderBy: { requestedAt: "asc" },
    select: {
      id: true,
      provider: true,
      requestedAt: true,
      status: true,
    },
  });

  const byProvider = new Map<string, typeof openRequests>();
  for (const request of openRequests) {
    const bucket = byProvider.get(request.provider) ?? [];
    bucket.push(request);
    byProvider.set(request.provider, bucket);
  }

  const warnThresholdMs = resolvePendingWarnMs();
  const nowMs = Date.now();

  for (const [provider, requests] of byProvider) {
    voiceDeletionPendingProviderGauge.set({ provider }, requests.length);

    const oldest = requests[0];
    if (!oldest) {
      voiceDeletionOldestPendingSeconds.set({ provider }, 0);
      continue;
    }

    const ageSeconds = Math.max(0, (nowMs - oldest.requestedAt.getTime()) / 1000);
    voiceDeletionOldestPendingSeconds.set({ provider }, ageSeconds);

    if (nowMs - oldest.requestedAt.getTime() >= warnThresholdMs) {
      logLoadControl(
        "voice_deletion_pending_stale",
        {
          provider,
          pendingCount: requests.length,
          oldestRequestId: oldest.id,
          oldestAgeDays: Math.floor(ageSeconds / 86_400),
          warnThresholdDays: Math.floor(warnThresholdMs / 86_400_000),
        },
        "warn",
      );
    }
  }
}

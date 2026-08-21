import { logProviderQueueMetrics } from "../queue/provider-queue-metrics.js";
import { refreshQueueDepthGauges } from "../queue/queue-depth-gauges.js";
import { reconcileApprovedRefundEnqueues } from "../billing/refund-recovery.service.js";
import { reconcilePendingVoiceDeletions } from "../voice-profiles/voice-deletion-reconcile.service.js";

const DEFAULT_INTERVAL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Periodic queue metrics for API process. Disable with LOAD_CONTROL_METRICS_INTERVAL_MS=0.
 * @see docs/music-generation-queue-load-control.md
 */
export function startLoadControlMetricsPolling(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const intervalMs = Number(env.LOAD_CONTROL_METRICS_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return;
  }

  const tick = () => {
    void logProviderQueueMetrics("api");
    void refreshQueueDepthGauges().catch(() => undefined);
    void reconcilePendingVoiceDeletions().catch(() => undefined);
    void reconcileApprovedRefundEnqueues().catch(() => undefined);
  };

  tick();

  timer = setInterval(tick, intervalMs);
}

export function stopLoadControlMetricsPolling(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

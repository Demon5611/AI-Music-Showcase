import { Counter, Gauge, type Registry } from "prom-client";
import { metricsRegistry } from "./registry.js";

function getOrCreateCounter(
  registry: Registry,
  config: { name: string; help: string; labelNames?: readonly string[] },
): Counter<string> {
  const existing = registry.getSingleMetric(config.name);
  if (existing) {
    return existing as Counter<string>;
  }

  return new Counter({
    name: config.name,
    help: config.help,
    labelNames: config.labelNames ? [...config.labelNames] : [],
    registers: [registry],
  });
}

function getOrCreateGauge(
  registry: Registry,
  config: { name: string; help: string; labelNames?: readonly string[] },
): Gauge<string> {
  const existing = registry.getSingleMetric(config.name);
  if (existing) {
    return existing as Gauge<string>;
  }

  return new Gauge({
    name: config.name,
    help: config.help,
    labelNames: config.labelNames ? [...config.labelNames] : [],
    registers: [registry],
  });
}

export type VoiceDeletionMetrics = {
  voiceDeletionRequestedTotal: Counter<string>;
  voiceDeletionLocalPurgeCompletedTotal: Counter<string>;
  voiceDeletionPendingProviderTotal: Counter<string>;
  voiceDeletionConfirmedTotal: Counter<string>;
  voiceDeletionFailedTotal: Counter<string>;
  voiceDeletionPendingProviderGauge: Gauge<string>;
  voiceDeletionOldestPendingSeconds: Gauge<string>;
};

let singleton: VoiceDeletionMetrics | null = null;

export function createVoiceDeletionMetrics(
  registry: Registry = metricsRegistry,
): VoiceDeletionMetrics {
  return {
    voiceDeletionRequestedTotal: getOrCreateCounter(registry, {
      name: "voice_deletion_requested_total",
      help: "Voice profile deletion requests initiated",
      labelNames: ["provider"],
    }),
    voiceDeletionLocalPurgeCompletedTotal: getOrCreateCounter(registry, {
      name: "voice_deletion_local_purge_completed_total",
      help: "Voice profile local source audio purges completed",
      labelNames: ["provider"],
    }),
    voiceDeletionPendingProviderTotal: getOrCreateCounter(registry, {
      name: "voice_deletion_pending_provider_total",
      help: "Voice profile provider-side deletion requests queued or submitted",
      labelNames: ["provider"],
    }),
    voiceDeletionConfirmedTotal: getOrCreateCounter(registry, {
      name: "voice_deletion_confirmed_total",
      help: "Voice profile provider-side deletions confirmed by ops",
      labelNames: ["provider"],
    }),
    voiceDeletionFailedTotal: getOrCreateCounter(registry, {
      name: "voice_deletion_failed_total",
      help: "Voice profile deletion failures",
      labelNames: ["provider", "reason"],
    }),
    voiceDeletionPendingProviderGauge: getOrCreateGauge(registry, {
      name: "voice_deletion_pending_provider",
      help: "Open manual provider voice deletion requests",
      labelNames: ["provider"],
    }),
    voiceDeletionOldestPendingSeconds: getOrCreateGauge(registry, {
      name: "voice_deletion_oldest_pending_seconds",
      help: "Age in seconds of the oldest open provider voice deletion request",
      labelNames: ["provider"],
    }),
  };
}

export function getVoiceDeletionMetrics(): VoiceDeletionMetrics {
  if (!singleton) {
    singleton = createVoiceDeletionMetrics();
  }
  return singleton;
}

export function resetVoiceDeletionMetricsForTests(): void {
  singleton = null;
}

export const voiceDeletionRequestedTotal = {
  inc: (labels: { provider: string }, value?: number) =>
    getVoiceDeletionMetrics().voiceDeletionRequestedTotal.inc(labels, value),
};

export const voiceDeletionLocalPurgeCompletedTotal = {
  inc: (labels: { provider: string }, value?: number) =>
    getVoiceDeletionMetrics().voiceDeletionLocalPurgeCompletedTotal.inc(labels, value),
};

export const voiceDeletionPendingProviderTotal = {
  inc: (labels: { provider: string }, value?: number) =>
    getVoiceDeletionMetrics().voiceDeletionPendingProviderTotal.inc(labels, value),
};

export const voiceDeletionConfirmedTotal = {
  inc: (labels: { provider: string }, value?: number) =>
    getVoiceDeletionMetrics().voiceDeletionConfirmedTotal.inc(labels, value),
};

export const voiceDeletionFailedTotal = {
  inc: (labels: { provider: string; reason: string }, value?: number) =>
    getVoiceDeletionMetrics().voiceDeletionFailedTotal.inc(labels, value),
};

export const voiceDeletionPendingProviderGauge = {
  set: (labels: { provider: string }, value: number) =>
    getVoiceDeletionMetrics().voiceDeletionPendingProviderGauge.set(labels, value),
};

export const voiceDeletionOldestPendingSeconds = {
  set: (labels: { provider: string }, value: number) =>
    getVoiceDeletionMetrics().voiceDeletionOldestPendingSeconds.set(labels, value),
};

import { Counter, Gauge, Histogram, type Registry } from "prom-client";
import { metricsRegistry } from "./registry.js";
import { DURATION_BUCKETS_SECONDS } from "./metrics.js";

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

function getOrCreateHistogram(
  registry: Registry,
  config: { name: string; help: string; labelNames?: readonly string[]; buckets: number[] },
): Histogram<string> {
  const existing = registry.getSingleMetric(config.name);
  if (existing) {
    return existing as Histogram<string>;
  }

  return new Histogram({
    name: config.name,
    help: config.help,
    labelNames: config.labelNames ? [...config.labelNames] : [],
    buckets: config.buckets,
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

export type MurekaMetrics = {
  murekaVocalCloneStartedTotal: Counter<string>;
  murekaVocalCloneCompletedTotal: Counter<string>;
  murekaVocalCloneFailedTotal: Counter<string>;
  murekaGenerationStartedTotal: Counter<string>;
  murekaGenerationCompletedTotal: Counter<string>;
  murekaGenerationPartialTotal: Counter<string>;
  murekaGenerationFailedTotal: Counter<string>;
  murekaGenerationDurationSeconds: Histogram<string>;
  murekaPollTotal: Counter<string>;
  murekaProviderErrorTotal: Counter<string>;
  murekaSubmitUnknownTotal: Counter<string>;
  murekaRefundTotal: Counter<string>;
  murekaEstimatedCostUsdTotal: Counter<string>;
  murekaActiveGenerationTasks: Gauge<string>;
  murekaQueueDepth: Gauge<string>;
  murekaR2PersistenceFailedTotal: Counter<string>;
};

let singleton: MurekaMetrics | null = null;

export function createMurekaMetrics(registry: Registry = metricsRegistry): MurekaMetrics {
  const buckets = [...DURATION_BUCKETS_SECONDS];

  return {
    murekaVocalCloneStartedTotal: getOrCreateCounter(registry, {
      name: "mureka_vocal_clone_started_total",
      help: "Mureka vocal clone operations started",
    }),
    murekaVocalCloneCompletedTotal: getOrCreateCounter(registry, {
      name: "mureka_vocal_clone_completed_total",
      help: "Mureka vocal clone operations completed",
    }),
    murekaVocalCloneFailedTotal: getOrCreateCounter(registry, {
      name: "mureka_vocal_clone_failed_total",
      help: "Mureka vocal clone operations failed",
    }),
    murekaGenerationStartedTotal: getOrCreateCounter(registry, {
      name: "mureka_generation_started_total",
      help: "Mureka song generations started",
    }),
    murekaGenerationCompletedTotal: getOrCreateCounter(registry, {
      name: "mureka_generation_completed_total",
      help: "Mureka song generations fully completed",
    }),
    murekaGenerationPartialTotal: getOrCreateCounter(registry, {
      name: "mureka_generation_partial_total",
      help: "Mureka song generations with partial success",
    }),
    murekaGenerationFailedTotal: getOrCreateCounter(registry, {
      name: "mureka_generation_failed_total",
      help: "Mureka song generations failed",
    }),
    murekaGenerationDurationSeconds: getOrCreateHistogram(registry, {
      name: "mureka_generation_duration_seconds",
      help: "Mureka generation end-to-end duration",
      buckets,
    }),
    murekaPollTotal: getOrCreateCounter(registry, {
      name: "mureka_poll_total",
      help: "Mureka poll queries",
    }),
    murekaProviderErrorTotal: getOrCreateCounter(registry, {
      name: "mureka_provider_error_total",
      help: "Mureka provider errors by kind and status",
      labelNames: ["kind", "status"],
    }),
    murekaSubmitUnknownTotal: getOrCreateCounter(registry, {
      name: "mureka_submit_unknown_total",
      help: "Mureka submits left in submit_unknown",
    }),
    murekaRefundTotal: getOrCreateCounter(registry, {
      name: "mureka_refund_total",
      help: "Mureka credit refunds",
      labelNames: ["operation", "reason"],
    }),
    murekaEstimatedCostUsdTotal: getOrCreateCounter(registry, {
      name: "mureka_estimated_cost_usd_total",
      help: "Estimated Mureka provider USD cost",
      labelNames: ["operation"],
    }),
    murekaActiveGenerationTasks: getOrCreateGauge(registry, {
      name: "mureka_active_generation_tasks",
      help: "Active Mureka generation tasks (distributed accounting)",
    }),
    murekaQueueDepth: getOrCreateGauge(registry, {
      name: "mureka_queue_depth",
      help: "Mureka provider queue waiting+delayed depth",
    }),
    murekaR2PersistenceFailedTotal: getOrCreateCounter(registry, {
      name: "mureka_r2_persistence_failed_total",
      help: "Mureka track R2 persistence terminal failures",
    }),
  };
}

export function getMurekaMetrics(): MurekaMetrics {
  if (!singleton) {
    singleton = createMurekaMetrics();
  }
  return singleton;
}

export const murekaVocalCloneStartedTotal = {
  inc: (value?: number) => getMurekaMetrics().murekaVocalCloneStartedTotal.inc(value),
};
export const murekaVocalCloneCompletedTotal = {
  inc: (value?: number) => getMurekaMetrics().murekaVocalCloneCompletedTotal.inc(value),
};
export const murekaVocalCloneFailedTotal = {
  inc: (value?: number) => getMurekaMetrics().murekaVocalCloneFailedTotal.inc(value),
};
export const murekaGenerationStartedTotal = {
  inc: (value?: number) => getMurekaMetrics().murekaGenerationStartedTotal.inc(value),
};
export const murekaGenerationCompletedTotal = {
  inc: (value?: number) => getMurekaMetrics().murekaGenerationCompletedTotal.inc(value),
};
export const murekaGenerationPartialTotal = {
  inc: (value?: number) => getMurekaMetrics().murekaGenerationPartialTotal.inc(value),
};
export const murekaGenerationFailedTotal = {
  inc: (value?: number) => getMurekaMetrics().murekaGenerationFailedTotal.inc(value),
};
export const murekaPollTotal = {
  inc: (value?: number) => getMurekaMetrics().murekaPollTotal.inc(value),
};
export const murekaProviderErrorTotal = {
  inc: (labels: { kind: string; status: string }, value?: number) =>
    getMurekaMetrics().murekaProviderErrorTotal.inc(labels, value),
};
export const murekaSubmitUnknownTotal = {
  inc: (value?: number) => getMurekaMetrics().murekaSubmitUnknownTotal.inc(value),
};
export const murekaRefundTotal = {
  inc: (labels: { operation: string; reason: string }, value?: number) =>
    getMurekaMetrics().murekaRefundTotal.inc(labels, value),
};
export const murekaEstimatedCostUsdTotal = {
  inc: (labels: { operation: string }, value?: number) =>
    getMurekaMetrics().murekaEstimatedCostUsdTotal.inc(labels, value),
};
export const murekaActiveGenerationTasks = {
  set: (value: number) => getMurekaMetrics().murekaActiveGenerationTasks.set(value),
  inc: (value?: number) => getMurekaMetrics().murekaActiveGenerationTasks.inc(value),
  dec: (value?: number) => getMurekaMetrics().murekaActiveGenerationTasks.dec(value),
};
export const murekaQueueDepth = {
  set: (value: number) => getMurekaMetrics().murekaQueueDepth.set(value),
};
export const murekaR2PersistenceFailedTotal = {
  inc: (value?: number) => getMurekaMetrics().murekaR2PersistenceFailedTotal.inc(value),
};
export const murekaGenerationDurationSeconds = {
  observe: (value: number) => getMurekaMetrics().murekaGenerationDurationSeconds.observe(value),
};

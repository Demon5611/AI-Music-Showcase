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

export type AudioengineMetrics = {
  audioengineVocalCloneStartedTotal: Counter<string>;
  audioengineVocalCloneCompletedTotal: Counter<string>;
  audioengineVocalCloneFailedTotal: Counter<string>;
  audioengineGenerationStartedTotal: Counter<string>;
  audioengineGenerationCompletedTotal: Counter<string>;
  audioengineGenerationPartialTotal: Counter<string>;
  audioengineGenerationFailedTotal: Counter<string>;
  audioengineGenerationDurationSeconds: Histogram<string>;
  audioenginePollTotal: Counter<string>;
  audioengineProviderErrorTotal: Counter<string>;
  audioengineSubmitUnknownTotal: Counter<string>;
  audioengineRefundTotal: Counter<string>;
  audioengineEstimatedCostUsdTotal: Counter<string>;
  audioengineActiveGenerationTasks: Gauge<string>;
  audioengineQueueDepth: Gauge<string>;
  audioengineR2PersistenceFailedTotal: Counter<string>;
};

let singleton: AudioengineMetrics | null = null;

export function createAudioengineMetrics(registry: Registry = metricsRegistry): AudioengineMetrics {
  const buckets = [...DURATION_BUCKETS_SECONDS];

  return {
    audioengineVocalCloneStartedTotal: getOrCreateCounter(registry, {
      name: "audioengine_vocal_clone_started_total",
      help: "Audioengine vocal clone operations started",
    }),
    audioengineVocalCloneCompletedTotal: getOrCreateCounter(registry, {
      name: "audioengine_vocal_clone_completed_total",
      help: "Audioengine vocal clone operations completed",
    }),
    audioengineVocalCloneFailedTotal: getOrCreateCounter(registry, {
      name: "audioengine_vocal_clone_failed_total",
      help: "Audioengine vocal clone operations failed",
    }),
    audioengineGenerationStartedTotal: getOrCreateCounter(registry, {
      name: "audioengine_generation_started_total",
      help: "Audioengine song generations started",
    }),
    audioengineGenerationCompletedTotal: getOrCreateCounter(registry, {
      name: "audioengine_generation_completed_total",
      help: "Audioengine song generations fully completed",
    }),
    audioengineGenerationPartialTotal: getOrCreateCounter(registry, {
      name: "audioengine_generation_partial_total",
      help: "Audioengine song generations with partial success",
    }),
    audioengineGenerationFailedTotal: getOrCreateCounter(registry, {
      name: "audioengine_generation_failed_total",
      help: "Audioengine song generations failed",
    }),
    audioengineGenerationDurationSeconds: getOrCreateHistogram(registry, {
      name: "audioengine_generation_duration_seconds",
      help: "Audioengine generation end-to-end duration",
      buckets,
    }),
    audioenginePollTotal: getOrCreateCounter(registry, {
      name: "audioengine_poll_total",
      help: "Audioengine poll queries",
    }),
    audioengineProviderErrorTotal: getOrCreateCounter(registry, {
      name: "audioengine_provider_error_total",
      help: "Audioengine provider errors by kind and status",
      labelNames: ["kind", "status"],
    }),
    audioengineSubmitUnknownTotal: getOrCreateCounter(registry, {
      name: "audioengine_submit_unknown_total",
      help: "Audioengine submits left in submit_unknown",
    }),
    audioengineRefundTotal: getOrCreateCounter(registry, {
      name: "audioengine_refund_total",
      help: "Audioengine credit refunds",
      labelNames: ["operation", "reason"],
    }),
    audioengineEstimatedCostUsdTotal: getOrCreateCounter(registry, {
      name: "audioengine_estimated_cost_usd_total",
      help: "Estimated Audioengine provider USD cost",
      labelNames: ["operation"],
    }),
    audioengineActiveGenerationTasks: getOrCreateGauge(registry, {
      name: "audioengine_active_generation_tasks",
      help: "Active Audioengine generation tasks (distributed accounting)",
    }),
    audioengineQueueDepth: getOrCreateGauge(registry, {
      name: "audioengine_queue_depth",
      help: "Audioengine provider queue waiting+delayed depth",
    }),
    audioengineR2PersistenceFailedTotal: getOrCreateCounter(registry, {
      name: "audioengine_r2_persistence_failed_total",
      help: "Audioengine track R2 persistence terminal failures",
    }),
  };
}

export function getAudioengineMetrics(): AudioengineMetrics {
  if (!singleton) {
    singleton = createAudioengineMetrics();
  }
  return singleton;
}

export const audioengineVocalCloneStartedTotal = {
  inc: (value?: number) => getAudioengineMetrics().audioengineVocalCloneStartedTotal.inc(value),
};
export const audioengineVocalCloneCompletedTotal = {
  inc: (value?: number) => getAudioengineMetrics().audioengineVocalCloneCompletedTotal.inc(value),
};
export const audioengineVocalCloneFailedTotal = {
  inc: (value?: number) => getAudioengineMetrics().audioengineVocalCloneFailedTotal.inc(value),
};
export const audioengineGenerationStartedTotal = {
  inc: (value?: number) => getAudioengineMetrics().audioengineGenerationStartedTotal.inc(value),
};
export const audioengineGenerationCompletedTotal = {
  inc: (value?: number) => getAudioengineMetrics().audioengineGenerationCompletedTotal.inc(value),
};
export const audioengineGenerationPartialTotal = {
  inc: (value?: number) => getAudioengineMetrics().audioengineGenerationPartialTotal.inc(value),
};
export const audioengineGenerationFailedTotal = {
  inc: (value?: number) => getAudioengineMetrics().audioengineGenerationFailedTotal.inc(value),
};
export const audioenginePollTotal = {
  inc: (value?: number) => getAudioengineMetrics().audioenginePollTotal.inc(value),
};
export const audioengineProviderErrorTotal = {
  inc: (labels: { kind: string; status: string }, value?: number) =>
    getAudioengineMetrics().audioengineProviderErrorTotal.inc(labels, value),
};
export const audioengineSubmitUnknownTotal = {
  inc: (value?: number) => getAudioengineMetrics().audioengineSubmitUnknownTotal.inc(value),
};
export const audioengineRefundTotal = {
  inc: (labels: { operation: string; reason: string }, value?: number) =>
    getAudioengineMetrics().audioengineRefundTotal.inc(labels, value),
};
export const audioengineEstimatedCostUsdTotal = {
  inc: (labels: { operation: string }, value?: number) =>
    getAudioengineMetrics().audioengineEstimatedCostUsdTotal.inc(labels, value),
};
export const audioengineActiveGenerationTasks = {
  set: (value: number) => getAudioengineMetrics().audioengineActiveGenerationTasks.set(value),
  inc: (value?: number) => getAudioengineMetrics().audioengineActiveGenerationTasks.inc(value),
  dec: (value?: number) => getAudioengineMetrics().audioengineActiveGenerationTasks.dec(value),
};
export const audioengineQueueDepth = {
  set: (value: number) => getAudioengineMetrics().audioengineQueueDepth.set(value),
};
export const audioengineR2PersistenceFailedTotal = {
  inc: (value?: number) => getAudioengineMetrics().audioengineR2PersistenceFailedTotal.inc(value),
};
export const audioengineGenerationDurationSeconds = {
  observe: (value: number) => getAudioengineMetrics().audioengineGenerationDurationSeconds.observe(value),
};

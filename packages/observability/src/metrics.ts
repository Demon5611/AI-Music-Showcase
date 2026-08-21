import { Counter, Gauge, Histogram, type Registry } from "prom-client";
import { metricsRegistry } from "./registry.js";

/** Buckets for ops typically 10ms → 60s. */
export const DURATION_BUCKETS_SECONDS = [
  0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
] as const;

export type CallbackOutcome =
  | "applied"
  | "duplicate"
  | "terminal_ignored"
  | "invalid_signature"
  | "expired"
  | "legacy_rejected"
  | "error"
  | "ignored";

export type AudioNotReadyReason = "missing_key" | "persist_failed" | "storage_missing";

export type StorageOp = "put" | "get" | "delete" | "head";

/** Closed set for callback phase latency — never use free-form phase names. */
export type CallbackPhase =
  | "callback_resolve"
  | "callback_transition"
  | "track_metadata_upsert"
  | "persistence_enqueue"
  | "callback_total";

/** Closed set for Prom labels — never use error.message. */
export type MetricErrorCode =
  | "timeout"
  | "storage_transient"
  | "storage_not_found"
  | "storage_config"
  | "invalid_url"
  | "ssrf_blocked"
  | "oversize"
  | "invalid_audio"
  | "provider_4xx"
  | "provider_5xx"
  | "unknown";

const METRIC_ERROR_CODES: ReadonlySet<string> = new Set([
  "timeout",
  "storage_transient",
  "storage_not_found",
  "storage_config",
  "invalid_url",
  "ssrf_blocked",
  "oversize",
  "invalid_audio",
  "provider_4xx",
  "provider_5xx",
  "unknown",
]);

type DurationTarget = { observe: (value: number) => void };
type LabeledDurationTarget = {
  observe: (labels: Record<string, string>, value: number) => void;
};

function secondsSince(startedAtMs: number): number {
  return Math.max(0, (Date.now() - startedAtMs) / 1000);
}

export function observeDuration(target: DurationTarget, startedAtMs: number): void {
  target.observe(secondsSince(startedAtMs));
}

export function observeDurationLabeled(
  target: LabeledDurationTarget,
  labels: Record<string, string>,
  startedAtMs: number,
): void {
  target.observe(labels, secondsSince(startedAtMs));
}

function getOrCreateCounter(
  registry: Registry,
  config: {
    name: string;
    help: string;
    labelNames?: readonly string[];
  },
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
  config: {
    name: string;
    help: string;
    labelNames?: readonly string[];
    buckets: number[];
  },
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
  config: { name: string; help: string },
): Gauge<string> {
  const existing = registry.getSingleMetric(config.name);
  if (existing) {
    return existing as Gauge<string>;
  }

  return new Gauge({
    name: config.name,
    help: config.help,
    registers: [registry],
  });
}

export type ProviderSubmitAttemptResult =
  | "submitted"
  | "submit_unknown"
  | "retryable_capacity"
  | "failed";

export type MusicMetrics = {
  musicGenerationStartedTotal: Counter<string>;
  musicGenerationCompletedTotal: Counter<string>;
  musicGenerationFailedTotal: Counter<string>;
  musicCallbackTotal: Counter<string>;
  musicPersistSuccessTotal: Counter<string>;
  musicPersistFailedTotal: Counter<string>;
  musicPersistRetryTotal: Counter<string>;
  musicAudioNotReadyTotal: Counter<string>;
  musicStorageNotFoundTotal: Counter<string>;
  musicStorageTransientErrorTotal: Counter<string>;
  musicProviderSubmitAttemptsTotal: Counter<string>;
  musicCallbackDurationSeconds: Histogram<string>;
  musicCallbackPhaseDurationSeconds: Histogram<string>;
  musicProviderSubmitDurationSeconds: Histogram<string>;
  musicProviderPollDurationSeconds: Histogram<string>;
  musicDownloadDurationSeconds: Histogram<string>;
  musicUploadDurationSeconds: Histogram<string>;
  musicPersistDurationSeconds: Histogram<string>;
  musicStoragePutDurationSeconds: Histogram<string>;
  musicStorageGetDurationSeconds: Histogram<string>;
  musicGenerationQueueDepth: Gauge<string>;
  musicPersistenceQueueDepth: Gauge<string>;
};

let musicMetricsSingleton: MusicMetrics | null = null;

/**
 * Idempotent factory: safe under hot reload / repeated imports.
 * Uses Registry.getSingleMetric to avoid "already registered" errors.
 */
export function createMusicMetrics(registry: Registry = metricsRegistry): MusicMetrics {
  const buckets = [...DURATION_BUCKETS_SECONDS];

  return {
    musicGenerationStartedTotal: getOrCreateCounter(registry, {
      name: "music_generation_started_total",
      help: "Music generations successfully created and enqueued",
    }),
    musicGenerationCompletedTotal: getOrCreateCounter(registry, {
      name: "music_generation_completed_total",
      help: "Music generations that transitioned to completed (applied only)",
    }),
    musicGenerationFailedTotal: getOrCreateCounter(registry, {
      name: "music_generation_failed_total",
      help: "Music generations that transitioned to failed (applied only)",
    }),
    musicCallbackTotal: getOrCreateCounter(registry, {
      name: "music_callback_total",
      help: "Provider music callbacks by outcome",
      labelNames: ["outcome"],
    }),
    musicPersistSuccessTotal: getOrCreateCounter(registry, {
      name: "music_persist_success_total",
      help: "Tracks successfully persisted to object storage",
    }),
    musicPersistFailedTotal: getOrCreateCounter(registry, {
      name: "music_persist_failed_total",
      help: "Tracks that terminal-failed persistence",
      labelNames: ["error_code"],
    }),
    musicPersistRetryTotal: getOrCreateCounter(registry, {
      name: "music_persist_retry_total",
      help: "Persistence attempts returned to pending for retry",
      labelNames: ["error_code"],
    }),
    musicAudioNotReadyTotal: getOrCreateCounter(registry, {
      name: "music_audio_not_ready_total",
      help: "Playback requests rejected because audio is not ready",
      labelNames: ["reason"],
    }),
    musicStorageNotFoundTotal: getOrCreateCounter(registry, {
      name: "music_storage_not_found_total",
      help: "Storage not-found errors by operation",
      labelNames: ["operation"],
    }),
    musicStorageTransientErrorTotal: getOrCreateCounter(registry, {
      name: "music_storage_transient_error_total",
      help: "Storage transient errors by operation",
      labelNames: ["operation"],
    }),
    musicProviderSubmitAttemptsTotal: getOrCreateCounter(registry, {
      name: "music_provider_submit_attempts_total",
      help: "Completed provider music HTTP submit attempts by result",
      labelNames: ["result"],
    }),
    musicCallbackDurationSeconds: getOrCreateHistogram(registry, {
      name: "music_callback_duration_seconds",
      help: "Music callback handler duration",
      buckets,
    }),
    musicCallbackPhaseDurationSeconds: getOrCreateHistogram(registry, {
      name: "music_callback_phase_duration_seconds",
      help: "Music callback handler duration by phase",
      labelNames: ["phase"],
      buckets,
    }),
    musicProviderSubmitDurationSeconds: getOrCreateHistogram(registry, {
      name: "music_provider_submit_duration_seconds",
      help: "Provider music submit (POST) duration",
      buckets,
    }),
    musicProviderPollDurationSeconds: getOrCreateHistogram(registry, {
      name: "music_provider_poll_duration_seconds",
      help: "Provider status poll duration",
      buckets,
    }),
    musicDownloadDurationSeconds: getOrCreateHistogram(registry, {
      name: "music_download_duration_seconds",
      help: "Secure track audio download duration during persistence",
      buckets,
    }),
    musicUploadDurationSeconds: getOrCreateHistogram(registry, {
      name: "music_upload_duration_seconds",
      help: "Track audio upload to object storage during persistence",
      buckets,
    }),
    musicPersistDurationSeconds: getOrCreateHistogram(registry, {
      name: "music_persist_duration_seconds",
      help: "End-to-end music track persistence job duration",
      buckets,
    }),
    musicStoragePutDurationSeconds: getOrCreateHistogram(registry, {
      name: "music_storage_put_duration_seconds",
      help: "Object storage putObject duration",
      labelNames: ["driver"],
      buckets,
    }),
    musicStorageGetDurationSeconds: getOrCreateHistogram(registry, {
      name: "music_storage_get_duration_seconds",
      help: "Object storage getObject duration",
      labelNames: ["driver"],
      buckets,
    }),
    musicGenerationQueueDepth: getOrCreateGauge(registry, {
      name: "music_generation_queue_depth",
      help:
        "BullMQ provider-jobs backlog: waiting+delayed only (excludes active/paused/waiting-children)",
    }),
    musicPersistenceQueueDepth: getOrCreateGauge(registry, {
      name: "music_persistence_queue_depth",
      help:
        "BullMQ music-track-persistence backlog: waiting+delayed only (excludes active/paused/waiting-children)",
    }),
  };
}

export function getMusicMetrics(): MusicMetrics {
  if (!musicMetricsSingleton) {
    musicMetricsSingleton = createMusicMetrics();
  }

  return musicMetricsSingleton;
}

/** @internal test helper — clears process singleton only (Registry metrics remain). */
export function resetMusicMetricsForTests(): void {
  musicMetricsSingleton = null;
}

export const musicGenerationStartedTotal = {
  inc: (value?: number) => getMusicMetrics().musicGenerationStartedTotal.inc(value),
};
export const musicGenerationCompletedTotal = {
  inc: (value?: number) => getMusicMetrics().musicGenerationCompletedTotal.inc(value),
};
export const musicGenerationFailedTotal = {
  inc: (value?: number) => getMusicMetrics().musicGenerationFailedTotal.inc(value),
};
export const musicCallbackTotal = {
  inc: (labels: { outcome: string }, value?: number) =>
    getMusicMetrics().musicCallbackTotal.inc(labels, value),
};
export const musicPersistSuccessTotal = {
  inc: (value?: number) => getMusicMetrics().musicPersistSuccessTotal.inc(value),
};
export const musicPersistFailedTotal = {
  inc: (labels: { error_code: string }, value?: number) =>
    getMusicMetrics().musicPersistFailedTotal.inc(labels, value),
};
export const musicPersistRetryTotal = {
  inc: (labels: { error_code: string }, value?: number) =>
    getMusicMetrics().musicPersistRetryTotal.inc(labels, value),
};
export const musicAudioNotReadyTotal = {
  inc: (labels: { reason: string }, value?: number) =>
    getMusicMetrics().musicAudioNotReadyTotal.inc(labels, value),
};
export const musicStorageNotFoundTotal = {
  inc: (labels: { operation: string }, value?: number) =>
    getMusicMetrics().musicStorageNotFoundTotal.inc(labels, value),
};
export const musicStorageTransientErrorTotal = {
  inc: (labels: { operation: string }, value?: number) =>
    getMusicMetrics().musicStorageTransientErrorTotal.inc(labels, value),
};
export const musicProviderSubmitAttemptsTotal = {
  inc: (labels: { result: ProviderSubmitAttemptResult }, value?: number) =>
    getMusicMetrics().musicProviderSubmitAttemptsTotal.inc(labels, value),
};

export function recordProviderSubmitAttempt(result: ProviderSubmitAttemptResult): void {
  musicProviderSubmitAttemptsTotal.inc({ result });
}

export const musicCallbackDurationSeconds = {
  observe: (value: number) => getMusicMetrics().musicCallbackDurationSeconds.observe(value),
};
export const musicCallbackPhaseDurationSeconds = {
  observe: (labels: Record<string, string>, value: number) =>
    getMusicMetrics().musicCallbackPhaseDurationSeconds.observe(labels, value),
};
export const musicProviderSubmitDurationSeconds = {
  observe: (value: number) => getMusicMetrics().musicProviderSubmitDurationSeconds.observe(value),
};
export const musicProviderPollDurationSeconds = {
  observe: (value: number) => getMusicMetrics().musicProviderPollDurationSeconds.observe(value),
};
export const musicDownloadDurationSeconds = {
  observe: (value: number) => getMusicMetrics().musicDownloadDurationSeconds.observe(value),
};
export const musicUploadDurationSeconds = {
  observe: (value: number) => getMusicMetrics().musicUploadDurationSeconds.observe(value),
};
export const musicPersistDurationSeconds = {
  observe: (value: number) => getMusicMetrics().musicPersistDurationSeconds.observe(value),
};
export const musicStoragePutDurationSeconds = {
  observe: (labels: Record<string, string>, value: number) =>
    getMusicMetrics().musicStoragePutDurationSeconds.observe(labels, value),
};
export const musicStorageGetDurationSeconds = {
  observe: (labels: Record<string, string>, value: number) =>
    getMusicMetrics().musicStorageGetDurationSeconds.observe(labels, value),
};
export const musicGenerationQueueDepth = {
  set: (value: number) => getMusicMetrics().musicGenerationQueueDepth.set(value),
};
export const musicPersistenceQueueDepth = {
  set: (value: number) => getMusicMetrics().musicPersistenceQueueDepth.set(value),
};

export function incCallback(outcome: CallbackOutcome): void {
  musicCallbackTotal.inc({ outcome });
}

export function observeCallbackPhase(phase: CallbackPhase, startedAtMs: number): void {
  observeDurationLabeled(musicCallbackPhaseDurationSeconds, { phase }, startedAtMs);
}

export function recordGenerationTransition(toStatus: "completed" | "failed"): void {
  if (toStatus === "completed") {
    musicGenerationCompletedTotal.inc();
    return;
  }

  musicGenerationFailedTotal.inc();
}

/**
 * Map internal error codes to a closed Prom label set.
 * Never pass free-form messages or arbitrary strings through.
 */
export function sanitizeErrorCode(code: string | null | undefined): MetricErrorCode {
  const raw = (code ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");

  if (!raw) {
    return "unknown";
  }

  if (raw === "TIMEOUT") {
    return "timeout";
  }

  if (
    raw === "R2_TRANSIENT" ||
    raw === "STORAGE_TRANSIENT" ||
    raw === "STORAGE_UNAVAILABLE" ||
    raw === "STORAGE_UPLOAD_FAILED" ||
    raw === "NETWORK"
  ) {
    return "storage_transient";
  }

  // Bucket/credentials mismatch — retrying cannot fix it, keep it separable.
  if (
    raw === "STORAGE_BUCKET_NOT_FOUND" ||
    raw === "STORAGE_FORBIDDEN" ||
    raw === "NOSUCHBUCKET" ||
    raw === "ACCESSDENIED"
  ) {
    return "storage_config";
  }

  if (raw === "STORAGE_NOT_FOUND" || raw === "ENOENT" || raw === "NOSUCHKEY" || raw === "NOTFOUND") {
    return "storage_not_found";
  }

  if (
    raw === "INVALID_URL" ||
    raw === "UNSUPPORTED_SCHEME" ||
    raw === "REDIRECT_INVALID" ||
    raw === "REDIRECT_LIMIT"
  ) {
    return "invalid_url";
  }

  if (raw === "SSRF_HOST" || raw === "SSRF_IP") {
    return "ssrf_blocked";
  }

  if (raw === "OVERSIZE") {
    return "oversize";
  }

  if (raw === "INVALID_AUDIO" || raw === "BAD_CONTENT_TYPE" || raw === "EMPTY_BODY") {
    return "invalid_audio";
  }

  if (/^HTTP_4\d\d$/.test(raw)) {
    return "provider_4xx";
  }

  if (/^HTTP_5\d\d$/.test(raw)) {
    return "provider_5xx";
  }

  const lower = raw.toLowerCase();
  if (METRIC_ERROR_CODES.has(lower)) {
    return lower as MetricErrorCode;
  }

  return "unknown";
}

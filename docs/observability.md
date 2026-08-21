# Observability (PR7)

Server-only package: `@ai-music/observability` (`prom-client`).

Not imported by `apps/web` / `@ai-music/shared`.

## Endpoints

| Process | Path | Notes |
|---------|------|-------|
| API | `GET /metrics` | `METRICS_ENABLED=false` → **404** `Not Found`. Optional `METRICS_BEARER_TOKEN`: missing/wrong → **401** `Unauthorized` (no config leakage). |
| API | `GET /health`, `GET /health/ready` | Unchanged |
| Worker | `GET /metrics`, `GET /health` | Separate HTTP on `WORKER_METRICS_HOST`:`WORKER_METRICS_PORT` (default `0.0.0.0:9091`). Off with `WORKER_METRICS_ENABLED=false`. |

Protect production scrape via private network and/or bearer token.

Worker shutdown order: stop pollers → close BullMQ workers/queues → close metrics HTTP → exit.

## Metrics catalog

### Counters

- `music_generation_started_total`
- `music_generation_completed_total` / `music_generation_failed_total` — only when status transition `applied === true`
- `music_callback_total{outcome}` — `applied|duplicate|terminal_ignored|invalid_signature|expired|legacy_rejected|error|ignored`
- `music_persist_success_total` / `music_persist_failed_total{error_code}` / `music_persist_retry_total{error_code}`
- `music_audio_not_ready_total{reason}` — `missing_key|persist_failed|storage_missing`
- `music_storage_not_found_total{operation}` / `music_storage_transient_error_total{operation}`
- `music_provider_submit_attempts_total{service,result}` — one increment per finished HTTP submit attempt.
  `result` closed set: `submitted` | `submit_unknown` | `retryable_capacity` | `failed`.
  `service` comes from process default label (`api`|`worker`; emit site is Worker).

### Histograms (buckets ~10ms–60s)

- `music_callback_duration_seconds`
- `music_callback_phase_duration_seconds{phase}` — `callback_resolve` | `callback_transition` | `track_metadata_upsert` | `persistence_enqueue` | `callback_total`
- `music_provider_submit_duration_seconds`
- `music_provider_poll_duration_seconds`
- `music_download_duration_seconds` / `music_upload_duration_seconds` / `music_persist_duration_seconds`
- `music_storage_put_duration_seconds{driver}` / `music_storage_get_duration_seconds{driver}`

### Gauges (BullMQ only)

- `music_generation_queue_depth` — **waiting + delayed** on `provider-jobs`
- `music_persistence_queue_depth` — **waiting + delayed** on `music-track-persistence`

These gauges are a **backlog of waiting work**, not “all unfinished jobs”.
They **exclude** `active`, `paused`, and `waiting-children`.

No DB polling gauges in PR7.

## Labels

Allowed: `outcome`, `operation`, `error_code`, `driver`, `phase`, `result`, `service` (default process label `api`|`worker`).

`error_code` closed set only:

`timeout` | `storage_transient` | `storage_not_found` | `invalid_url` | `ssrf_blocked` | `oversize` | `invalid_audio` | `provider_4xx` | `provider_5xx` | `unknown`

Forbidden: `generationId`, `trackId`, `jobId`, `userId`, `providerTaskId`, URLs, free-form `error.message`.

IDs stay in `logLoadControl` structured logs only.

## Registry / hot reload

Metrics are created via `createMusicMetrics()` / `getMusicMetrics()` using `Registry.getSingleMetric` — safe if the module is re-evaluated (no “already registered” crash).

## SLA signals (for future Grafana/Alertmanager)

| Signal | Metric |
|--------|--------|
| Callback latency | `music_callback_duration_seconds` p95/p99 |
| Callback phases | `music_callback_phase_duration_seconds{phase}` |
| Persist success rate | `success / (success+failed)` |
| Persist retries | `music_persist_retry_total` |
| Playback not ready | `music_audio_not_ready_total` rate |
| Waiting backlog | `music_*_queue_depth` (waiting+delayed) |
| Submit attempt outcomes | `music_provider_submit_attempts_total{result}` |

## Alert rules (PR9)

> Load-test fake provider **отложен**; alert rules и metric остаются. Resume harness:
> [load-testing.md](./load-testing.md) → `apps/suno-fake`.

Executable Prometheus rules: `deploy/observability/alerts/music-generation.rules.yml`.

Ratio / rate alerts include **traffic guards** (minimum submit/start rate) to avoid noise on idle staging.

Validate when `promtool` is installed:

```bash
promtool check rules deploy/observability/alerts/music-generation.rules.yml
```

Raw `GET /metrics` does not evaluate alerts — a Prometheus + Alertmanager scrape stack is required.

Runbooks: `docs/runbooks/*.md`. Load testing: `docs/load-testing.md`.

## Architecture notes

- Storage is instrumented via `createInstrumentedObjectStorage` decorator in API/Worker composition roots — `@ai-music/storage` has no Prometheus dependency.
- One Prometheus Registry per process (API vs Worker); default label `service` distinguishes scrape targets after merge.

# Music generation queue — load control

Source of truth for agents and operators: how music generation throughput is shaped, monitored, and tuned.

## Architecture (provider queues)

```txt
User → API (enqueue BullMQ) → Worker (submit Legacyengine POST) → Legacyengine (async generation)
                ↑                           ↑
         plan priority              Redis rate limiter
         backpressure 503           18 req / 10s per API key
```

1. **BullMQ `provider-jobs`** — Legacyengine submit queue; Studio/Pro/Free priority (1 / 5 / 10).
2. **BullMQ `audioengine-provider-jobs`** — Audioengine submit, delayed poll, and vocal-clone jobs.
3. **Provider capacity controls** — Legacyengine rate limiter and Audioengine concurrency limiters.

## Structured logs

All load events emit **one JSON line** per event:

```json
{"scope":"load-control","event":"queue_metrics","ts":"...","waiting":12,...}
```

**Grep in prod/dev:**

```bash
rg '"scope":"load-control"' logs/
# or live:
pnpm dev:worker 2>&1 | rg 'load-control'
pnpm dev:api 2>&1 | rg 'load-control'
```

### Events

| event | source | meaning |
|-------|--------|---------|
| `queue_metrics` | api, worker | Periodic or on-demand BullMQ counts |
| `queue_enqueue` | api | Job added to BullMQ |
| `queue_backpressure` | api | Rejected: waiting >= 80 |
| `provider_job_lifecycle` | worker | start / done / failed + waitMs, durationMs |
| `legacyengine_rate_limit_acquire` | ai-providers | Waited for Redis/memory slot (only if waitedMs > 0) |
| `legacyengine_rate_limit_timeout` | ai-providers | Could not acquire slot within max wait |
| `legacyengine_submit` | ai-providers, worker | Legacyengine task created (taskId) |
| `legacyengine_rate_limit_retry` | ai-providers | HTTP 405/430 retry |
| `legacyengine_callback_sync` | api | Webhook updated DB |
| `audioengine_submit` | worker | Audioengine submit result, including `submit_unknown` |
| `audioengine_submit_unknown_reconcile` | worker | Generation requires manual submit review |
| `audioengine_limiter_acquire` / `audioengine_limiter_timeout` | ai-providers | Audioengine concurrency permit |

**Warn level:** `queue_metrics` when `waiting >= 50`; `queue_backpressure` always warn.

## HTTP observability

```bash
curl -s http://localhost:3001/api/music/ops/status | jq
```

Returns `providerQueue`: `{ waiting, active, failed, delayed, estimatedSubmitWaitSec }`.

User-facing status includes `queuePhase` (`queued` | `submitted` | `processing` | …) and `queueEtaSec` while in our queue.

## Env knobs (agent tuning)

| Variable | Default | Effect |
|----------|---------|--------|
| `REDIS_URL` | localhost | **Required in prod** for shared Legacyengine rate limit across API + workers |
| `WORKER_PROVIDER_CONCURRENCY` | 4 | Parallel BullMQ jobs per worker process |
| `AUDIOENGINE_WORKER_CONCURRENCY` | 1 | Parallel Audioengine BullMQ jobs per worker process. Staging may go up to 5 (temporary grant). Not a production contract. |
| `AUDIOENGINE_PROVIDER_CONCURRENCY` | 1 | Concurrent Audioengine song submits. Staging may go up to 5. |
| `AUDIOENGINE_VOCAL_CLONE_CONCURRENCY` | 1 | Concurrent Audioengine vocal-clone submits |
| `LEGACYENGINE_RATE_LIMIT_MAX` | 18 | Max Legacyengine POST / window (Legacyengine doc: 20/10s) |
| `LEGACYENGINE_RATE_LIMIT_WINDOW_MS` | 10000 | Sliding window |
| `LEGACYENGINE_RATE_LIMIT_MAX_WAIT_MS` | 120000 | Max wait before limiter timeout |
| `LOAD_CONTROL_METRICS_INTERVAL_MS` | 60000 | API periodic `queue_metrics`; `0` = off |
| `LEGACYENGINE_CALLBACK_URL` | local | Static/legacy fallback URL (prepare) |
| `LEGACYENGINE_CALLBACK_SIGNED_URL_ENABLED` | true | Worker injects signed URL after CAS |
| `LEGACYENGINE_CALLBACK_TOKEN_TTL_SEC` | 86400 | HMAC expiry for signed callback |
| `LEGACYENGINE_CALLBACK_LEGACY_CUTOFF_AT` | unset | Legacy route: only `createdAt < cutoff` |
| `LEGACYENGINE_CALLBACK_LEGACY_DISABLED` | false | After drain: legacy route → 410 |

Constants in code: `packages/shared/src/load-control/constants.ts`.

## Thresholds

| Constant | Value | Behavior |
|----------|-------|----------|
| `PROVIDER_QUEUE_ALERT_THRESHOLD` | 50 | `queue_metrics` logged as **warn** |
| `PROVIDER_QUEUE_BACKPRESSURE_THRESHOLD` | 80 | API **503** + `retryAfterSec` before credits spend |

## Scaling checklist (agent)

1. **Redis running** — same URL for API and all workers.
2. **One or more workers** — `pnpm dev:worker` (separate processes for horizontal scale).
3. Watch `queue_metrics`: sustained `waiting > 50` → add worker replicas; `legacyengine_rate_limit_retry` spikes → do not raise concurrency without raising `LEGACYENGINE_RATE_LIMIT_MAX` (Legacyengine cap).
4. **Do not** set `WORKER_PROVIDER_CONCURRENCY` high without Redis limiter — risk 405 and failed jobs.
5. Phase 5 (100+ sustained): multiple Legacyengine API keys — not implemented; see plan phase 5.

## Key files (do not duplicate logic)

| Area | Path |
|------|------|
| Log helper | `packages/shared/src/load-control/log-event.ts` |
| Thresholds | `packages/shared/src/load-control/constants.ts` |
| BullMQ enqueue + log | `apps/api/src/modules/queue/provider-job-queue.ts` |
| Metrics + backpressure | `apps/api/src/modules/queue/provider-queue-metrics.ts` |
| API polling | `apps/api/src/modules/queue/load-control-metrics-polling.ts` |
| Legacyengine rate limiter | `packages/ai-providers/.../legacyengine-rate-limiter.ts` |
| Legacyengine client submit/retry | `packages/ai-providers/.../legacyengine-api.client.ts` |
| Worker lifecycle log | `apps/worker/src/provider-job.worker.ts` |
| Webhook sync log | `apps/api/src/modules/music/legacyengine-callback.service.ts` |
| Plan priority | `packages/shared/src/entitlements/index.ts` (`QUEUE_PRIORITY_BY_PLAN`) |
| Submit guard (PR3) | `apps/worker/src/processors/process-provider-job.ts` |
| One-shot Legacyengine POST | `packages/ai-providers/.../legacyengine-music-submit-once.ts` |

## Music generate submit guard (PR3)

Legacyengineapi.org does **not** document `Idempotency-Key` / client reference on `POST /generate`.
Duplicate paid submits are prevented on our side.

### `MusicSubmissionState`

| state | meaning |
|-------|---------|
| `queued` | `providerTaskId` is `queue:*`; may CAS to dispatch |
| `dispatching` | CAS won; at most one in-flight vendor POST for `submitAttemptId` |
| `submitted` | Real Legacyengine `taskId` stored |
| `submit_unknown` | Wire may have succeeded; **automatic POST forbidden** |
| `failed` | Terminal fail + idempotent credit refund |

### Worker algorithm

1. Preflight (parse / build body / local rate limiter) **before** CAS.
2. CAS `queued → dispatching` with new `submitAttemptId` + `submitAttemptedAt`.
3. Exactly **one** fetch (`submitLegacyengineMusicTaskOnce`) — no client retries.
4. Classify:
   - ok → persist `taskId` (bounded DB retries; on failure write `recoveredProviderTaskId` into BullMQ `job.data`);
   - 400/401/404/413/429 → `failed` + refund;
   - 405/430/455 without taskId → back to `queued` + bounded BullMQ retry;
   - timeout / network / 500 / truncated / 200 without taskId → `submit_unknown` (no refund, no re-POST).
5. Orphaned `dispatching` (next job sees it) → `submit_unknown`, never back to `queued`.
6. All transitions are conditional on `submissionState` + `submitAttemptId`.

**Ops on `submit_unknown`:** pause/inspect the BullMQ queue; do **not** disable the guard. Manual recovery after verifying Legacyengine status; never blind re-POST. Signed callbacks may still early-bind `queue:*` → real `taskId` when `submissionState` is `dispatching` or `submit_unknown`.

## Legacyengine callback auth + status guard (PR4)

| Route | Auth | Notes |
|-------|------|-------|
| `POST /api/music/callback/legacyengine/:recordId/:token` | Versioned expiring HMAC (`v1:legacyengine-callback:{recordId}:{expires}`) | Built in **worker immediately before** vendor POST; never stored in DB/job/`providerRequestJson` |
| `POST /api/music/callback/legacyengine` | None (legacy) | Only records with `createdAt < LEGACYENGINE_CALLBACK_LEGACY_CUTOFF_AT`; then `LEGACYENGINE_CALLBACK_LEGACY_DISABLED=true` → 410 |

### Status mapping

| Callback | Effect |
|----------|--------|
| `code=200` + `text`/`first` | → `processing` |
| `code=200` + `complete` | → `completed` |
| `callbackType=error` + `400`/`451` | → `failed` + idempotent refund (spend required) |
| `code=500` / unknown | **not** failed, **no** refund; warn + poll fallback |

Transitions go through `applyMusicGenerationTransition` (terminal `completed`/`failed`). Duplicate `failed` still attempts `refundCreditsOnce` (partial recovery).

## Async track R2 persistence (PR5)

Callback / status sync **must not** download provider audio.

| Piece | Detail |
|-------|--------|
| Queue | `music-track-persistence` |
| Job | `persist-music-track` / jobId `music-track-persist-{trackId}` (no `:`) |
| FSM | `MusicTrackPersistenceState`: pending → processing → stored \| failed |
| Heartbeat | `persistenceHeartbeatAt` updated during download/upload; reconciler uses stale heartbeat (not age-only) |
| Security | Abort timeout, max bytes, SSRF, redirect re-check, magic bytes |
| Derived UI | `audioPersistence` = f(status, track.persistenceState) — **not** a new queuePhase |

Metrics (`scope=load-control`): `music_track_persist`, `music_track_persist_enqueue`, `music_track_persist_retry`, `music_track_persist_outcome`, `music_track_persist_reconcile`; callback `legacyengine_callback_sync` with `phase=callback_total|track_metadata_upsert|persistence_enqueue`.

### Deploy order

1. Migration `music_track_persistence_state`
2. Worker (consumer + reconciler)
3. API (metadata upsert + enqueue; no sync download)
4. Smoke: signed callback p95 < 2s, no 499
5. Then `LEGACYENGINE_CALLBACK_LEGACY_DISABLED=true` after legacy drain

### Staged rollout

1. Deploy **API** (signed + legacy).
2. Deploy **Worker** with `LEGACYENGINE_CALLBACK_SIGNED_URL_ENABLED=true`, `API_PUBLIC_URL`, `API_PROVIDER_REFERENCE_SECRET`.
3. Set `LEGACYENGINE_CALLBACK_LEGACY_CUTOFF_AT` after signed traffic is live.
4. After in-flight legacy drain: `LEGACYENGINE_CALLBACK_LEGACY_DISABLED=true` → legacy 410.

## Related docs

- [legacyengineapi.md](../.cursor/skills/music-provider-integration/references/legacyengineapi.md) — Legacyengine API constraints
- Queue acceleration plan (historical) — `.cursor/plans/queue_throughput_acceleration_*.plan.md`

# Engineering highlights

## Provider abstraction

Music and voice operations go through provider interfaces
(`MusicProvider`, generation adapters, voice adapters).
Application services depend on contracts, not vendor HTTP clients.

## Queue-based processing

Long-running AI work runs in BullMQ workers outside the HTTP request path.
API commits durable state, then enqueues; workers submit, poll, persist, and reconcile.

## Idempotency

Client retries must not create duplicate spend or duplicate provider submissions.
Idempotency keys and unique ledger constraints protect monetary side effects.

## Concurrency control

Provider throughput can be limited independently from API traffic using worker
concurrency and shared rate-limit buckets.

## Durable job lifecycle

Generation and persistence state survives API/worker restarts.
Reconcilers recover committed-but-not-enqueued or stalled work.

## Storage persistence

Temporary provider media URLs are not treated as long-term storage.
Workers download and store media under application-owned object keys.

## Credit ledger

Balances are derived from an append-only credit transaction ledger.
Spend and refund are explicit records with stable idempotency keys.

## Authorization

Authenticated identity comes from server-side auth.
Resource access is scoped by ownership; client-supplied user IDs are not trusted.

## Payment / refund safety

Checkout verification, credit grant, and refund processing use explicit lifecycle
states and idempotent callbacks / jobs.

## Observability

Independent API and Worker processes expose health/readiness and metrics hooks
suitable for multi-service deployment.

# Engineering highlights

## Provider abstraction

Music, voice, video, and payment operations go through provider interfaces. Application services depend on contracts, not vendor HTTP clients.

The video layer follows the same pattern: submit, poll, download, optional cancel, and reuse of an existing provider task are expressed through a stable provider contract.

## Queue-based processing

Long-running AI work runs in BullMQ workers outside the HTTP request path. API commits durable state, then enqueues; workers submit, poll, persist, compose, validate, and reconcile.

For Share Video / AI Story, scene generation is separated from final media composition so paid/generated scene assets can survive render retries.

## Idempotency

Client retries must not create duplicate spend or duplicate provider submissions. Idempotency keys, persisted provider task IDs, and unique ledger constraints protect monetary side effects.

Video retry paths can reuse an already-known provider task instead of issuing a second paid submit.

## Concurrency control

Provider throughput can be limited independently from API traffic using worker concurrency and shared rate-limit buckets.

Music and video providers can have different concurrency limits because their latency, quotas, and failure modes differ.

## Durable job lifecycle

Generation and persistence state survives API/worker restarts. Reconcilers recover committed-but-not-enqueued, submitted-but-unconfirmed, or stalled work.

The Share Video flow persists scene-level state so provider polling, final rendering, and recovery do not depend on one long-lived process.

## Media composition and validation

Generated short clips are not the final product artifact. The worker composes scenes with trims, timing decisions, overlays/transitions, and the source track using FFmpeg.

The final MP4 is probed before publication so a job is not marked ready solely because FFmpeg returned successfully.

## Anti-loop / source usage planning

Multi-scene AI Story flows track which ranges of generated clips are used during the final edit. This reduces obvious repeated loops when short provider clips must fill a longer social-video timeline.

## Server-controlled templates

Share Video templates are resolved on the server. Availability and advanced controls are fail-closed so the client cannot enable an unverified or disabled generation path by modifying request fields.

## Storage persistence

Temporary provider media URLs are not treated as long-term storage. Workers download and store music, scene clips, and final media under application-owned object keys.

## Credit ledger

Balances are derived from an append-only credit transaction ledger. Spend and refund are explicit records with stable idempotency keys.

Commercial pricing and exact provider cost models are intentionally not included in this public showcase.

## Authorization

Authenticated identity comes from server-side auth. Resource access is scoped by ownership; client-supplied user IDs are not trusted.

## Payment / refund safety

Checkout verification, credit grant, and refund processing use explicit lifecycle states and idempotent callbacks / jobs.

AI generation failures and render failures are handled separately so already-consumed external work is not accidentally treated as if no provider work occurred.

## Observability

Independent API and Worker processes expose health/readiness and metrics hooks suitable for multi-service deployment. Provider-specific operational balances, quotas, and production admin data are intentionally excluded from the public showcase.

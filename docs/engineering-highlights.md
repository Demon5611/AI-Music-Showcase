# Engineering highlights

## Provider abstraction

Music, voice, video, and payment operations are modeled behind stable interfaces. Application services depend on contracts instead of vendor HTTP clients.

The public repository keeps these boundaries visible while production adapter implementations remain private.

## Queue-based processing

Long-running AI work runs in BullMQ workers outside the HTTP request path. The API persists durable state before enqueueing; workers continue processing asynchronously.

For video workloads, external generation state is kept separate from final media composition so completed external work can survive local render retries.

## Idempotency

Retries must not duplicate monetary state changes or blindly duplicate external submissions. The architecture uses durable identifiers and idempotent state transitions around those side effects.

The showcase documents this reliability requirement without exposing provider-specific retry recipes.

## Concurrency control

External-provider throughput can be bounded independently from normal API traffic through worker-level concurrency and shared rate-limiting concepts.

Exact production limits and vendor-specific operational thresholds remain private.

## Durable job lifecycle

Generation state survives API / worker restarts. Recovery processes can reconcile durable state after crashes or uncertain external responses.

For Share Video, generated media and task identity are persisted separately from the final render state.

## Media composition and validation

Generated media is not automatically treated as the final product artifact. Application-owned media processing composes the final output and validates it before publication.

FFmpeg and ffprobe are retained in the public architecture because they demonstrate media-pipeline engineering; production creative presets and composition heuristics are not published.

## Server-controlled templates

Share Video templates are resolved and authorized server-side. The browser cannot enable a disabled or unsupported generation path simply by modifying request data.

Private template-to-provider mappings and generation directives are intentionally excluded.

## Storage persistence

Temporary external media URLs are not treated as durable application storage. Generated assets are persisted under application-controlled storage keys.

## Credit ledger

Balances are derived from an append-only credit transaction ledger. Spend and refund are explicit state transitions with stable identities.

Commercial pricing, provider cost models, margins, and package economics are intentionally not part of this public showcase.

## Authorization

Authenticated identity is established server-side. Domain-resource access is scoped by ownership; client-supplied ownership claims are not trusted.

## Payment / refund safety

Checkout, credit grant, and refund processing use explicit lifecycle state and idempotent processing concepts.

The public repository demonstrates the state-machine approach rather than publishing current merchant configuration or private payment operations.

## Observability

Independent API and Worker processes expose health/readiness and metrics concepts suitable for a multi-service deployment.

Provider balances, quotas, treasury data, private alerts, and production operational thresholds are intentionally excluded.

## What is deliberately not demonstrated in source

The public showcase does not attempt to teach a reader how to reproduce the production provider behavior. In particular it excludes:

- provider-specific HTTP implementations;
- proprietary prompt construction;
- detailed creative-planning algorithms;
- exact model/version parameters;
- routing, ranking, and fallback policy;
- vendor-specific recovery workarounds;
- commercial and operational decision rules.

Those details are maintained in the private production repository.

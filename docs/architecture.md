# Architecture

AI Music is a multi-service SaaS platform for AI-assisted song creation, optional personal-voice workflows, asynchronous generation, in-browser audio editing, and short-form share-video generation.

This document intentionally describes application architecture rather than production provider recipes.

## High-level flow

```text
Browser (Next.js)
   → Fastify API
      → PostgreSQL (domain state + credit ledger)
      → Redis / BullMQ (async jobs)
      → Payment boundary
   → Worker
      → Music / voice provider boundary
      → Video provider boundary
      → FFmpeg / ffprobe composition + validation
      → Storage abstraction
```

## Process boundaries

| Process | Responsibility |
| --- | --- |
| `apps/web` | Product UI, auth-session UX, polling, editor, Share Video UX |
| `apps/api` | Authorization, validation, billing state, enqueue, server-side gates, media access |
| `apps/worker` | Long-running provider work, polling, retries, persistence, reconciliation, media composition |

## Core packages

| Package | Role |
| --- | --- |
| `@ai-music/shared` | Shared contracts, schemas, constants, storage-key builders |
| `@ai-music/db` | Prisma models + append-only credits ledger + durable generation state |
| `@ai-music/ai-providers` | Public provider contracts and safe/demo implementations |
| payment packages | Payment-boundary examples retained from the sanitized showcase snapshot |
| `@ai-music/storage` | Storage abstraction |
| `@ai-music/api-client` | Typed HTTP client for the web app |
| `@ai-music/observability` | Metrics / health helpers |

## Video-generation boundary

The private production system has a dedicated video-provider layer. Business code depends on a stable `VideoProvider` contract rather than vendor-specific HTTP APIs.

The public repository demonstrates only the application-facing contract and deterministic mock behavior needed to understand the architecture.

```text
Application / Worker
        ↓
VideoProvider contract
        ↓
Public mock implementation
        ↓
Production adapters live privately
```

Provider-specific payload mapping, exact model/version selection, prompts, routing, fallback policy, account configuration, and commercial logic are intentionally excluded.

## Share Video / AI Story pipeline

```text
Track + source media + selected template
        ↓
Server-side validation / template resolution
        ↓
Persist application-level video state
        ↓
Background generation through provider boundary
        ↓
Persist external task identity and durable media
        ↓
Application-owned edit/composition stage
        ↓
FFmpeg composition
        ↓
ffprobe validation
        ↓
Final media persistence
```

The public diagram intentionally omits production creative-planning logic and provider assignment rules.

## Reliability rule

A local render/composition failure must not automatically trigger another external generation request for media that already exists.

Persisted task identity and durable generated assets allow recovery to distinguish external-generation work from local rendering work.

## Design constraints

1. Browser code does not call commercial AI or payment providers directly.
2. Monetary state transitions are ledger/state-machine based and designed for idempotency.
3. In-flight external work keeps persisted task affinity.
4. Worker jobs resume from durable state rather than process memory.
5. Generated media is copied into application-controlled storage.
6. External-task retries reconcile known work before creating replacement work.
7. Final media is validated before being marked ready.
8. Product/template availability is enforced server-side.
9. Production provider details remain outside the public showcase.

See also: [engineering-highlights.md](./engineering-highlights.md), [share-video.md](./share-video.md), [public-showcase-boundary.md](./public-showcase-boundary.md), [security-design.md](./security-design.md).

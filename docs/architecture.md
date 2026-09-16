# Architecture

AI Music is a multi-service SaaS platform for AI-assisted song creation, personal voice onboarding, asynchronous generation, in-browser audio editing, and short-form share-video generation.

## High-level flow

```text
Browser (Next.js)
   → Fastify API
      → PostgreSQL (domain state + credit ledger)
      → Redis / BullMQ (async jobs)
      → Payment gateway adapter (checkout / refund lifecycle)
   → Worker
      → Music / voice provider adapters
      → Video provider adapters
      → FFmpeg / ffprobe composition + validation
      → Object storage persistence
```

## Process boundaries

| Process | Responsibility |
| --- | --- |
| `apps/web` | Product UI, auth session UX, polling, editor, Share Video templates and progress UX |
| `apps/api` | AuthZ, validation, billing commits, job enqueue, template/server gates, signed media access |
| `apps/worker` | Long-running provider calls, scene generation, polling, retries, persistence, reconciliation, FFmpeg composition |

## Core packages

| Package | Role |
| --- | --- |
| `@ai-music/shared` | Zod contracts, constants, storage key builders, cross-service generation contracts |
| `@ai-music/db` | Prisma models + append-only credits ledger + durable music/video lifecycle state |
| `@ai-music/ai-providers` | Music / voice / video provider abstractions and adapters |
| `@ai-music/flitt-checkout` / `@ai-music/tbc-checkout` | Payment gateway adapters |
| `@ai-music/storage` | Object storage abstraction |
| `@ai-music/api-client` | Typed HTTP client for the web app |
| `@ai-music/observability` | Metrics / health helpers |

## Video-generation boundary

The private production code now has a dedicated `video` provider layer. Business code depends on a stable `VideoProvider` contract rather than vendor HTTP APIs. The contract covers submit, status polling, content download, optional cancellation, and safe reuse of an existing provider task during worker retries.

Provider implementations currently include:

- a CometAPI-backed adapter used for Wan/Sora-family video paths;
- a BytePlus / Seedance adapter behind explicit gates;
- a deterministic mock adapter for local/showcase execution.

The public showcase intentionally omits credentials, account identifiers, provider quotas, exact pricing, and commercially sensitive routing configuration.

## Share Video / AI Story pipeline

```text
Track + user image / template
        ↓
Server-side template resolution
        ↓
Scene / visual planning
        ↓
BullMQ scene jobs
        ↓
Video provider submit → poll/reconcile → durable scene media
        ↓
Edit plan / trims / playback-rate decisions
        ↓
FFmpeg composition + overlays + song audio
        ↓
ffprobe validation
        ↓
Final MP4 persisted to object storage
```

Important reliability rule: a render failure must not automatically cause already generated paid scenes to be generated again. Persisted scene state and provider task identity allow reconcile/re-render flows to resume from durable assets.

## Design constraints

1. Browser never calls commercial AI or payment providers directly.
2. Credit spend / refund is ledger-based and idempotent.
3. Existing media assets keep provider affinity; no silent cross-provider fallback for an in-flight task.
4. Worker jobs are retry-safe and resume from persisted state.
5. Generated media is copied into application-controlled object storage.
6. Video provider retry logic reuses persisted provider task IDs instead of blindly issuing a second paid submit.
7. Final share-video output is validated before being marked ready.
8. Product template availability and advanced video controls are enforced server-side.

See also: [engineering-highlights.md](./engineering-highlights.md), [share-video.md](./share-video.md), [security-design.md](./security-design.md).

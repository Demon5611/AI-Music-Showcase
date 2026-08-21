# Architecture

AI Music is a multi-service SaaS platform for AI-assisted song creation,
personal voice onboarding, asynchronous generation, and in-browser audio editing.

## High-level flow

```text
Browser (Next.js)
   → Fastify API
      → PostgreSQL (domain state + credit ledger)
      → Redis / BullMQ (async jobs)
      → Payment gateway adapter (checkout / refund lifecycle)
   → Worker
      → AI provider adapters (music / voice)
      → Object storage persistence
```

## Process boundaries

| Process | Responsibility |
| --- | --- |
| `apps/web` | Product UI, auth session UX, polling, editor |
| `apps/api` | AuthZ, validation, billing commits, job enqueue, signed media access |
| `apps/worker` | Long-running provider calls, retries, persistence, reconciliation |

## Core packages

| Package | Role |
| --- | --- |
| `@ai-music/shared` | Zod contracts, constants, storage key builders |
| `@ai-music/db` | Prisma models + append-only credits ledger |
| `@ai-music/ai-providers` | Music / voice provider abstractions and adapters |
| `@ai-music/flitt-checkout` / `@ai-music/tbc-checkout` | Payment gateway adapters |
| `@ai-music/storage` | Object storage abstraction |
| `@ai-music/api-client` | Typed HTTP client for the web app |
| `@ai-music/observability` | Metrics / health helpers |

## Design constraints

1. Browser never calls commercial AI or payment providers directly.
2. Credit spend / refund is ledger-based and idempotent.
3. Existing media assets keep provider affinity (no silent cross-provider fallback).
4. Worker jobs are retry-safe and resume from persisted state.
5. Generated media is copied into application-controlled object storage.

See also: [engineering-highlights.md](./engineering-highlights.md), [security-design.md](./security-design.md).

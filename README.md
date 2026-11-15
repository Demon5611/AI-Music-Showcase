# AI Music — Technical Showcase

TypeScript monorepo for asynchronous music generation, personal-voice workflows, browser-based audio editing, and short-form video composition.

The application separates the web client, HTTP API, and background workers. PostgreSQL stores domain state and credit transactions; Redis/BullMQ schedules asynchronous work; FFmpeg handles media composition and validation.

This public snapshot uses demo adapters and illustrative configuration. Production credentials, commercial integration identities, proprietary prompts, routing policies, negotiated pricing, and infrastructure identifiers are excluded.

## Responsibilities and failure handling

| Concern | Implementation approach | Intended property |
| --- | --- | --- |
| Authorization | API-side identity and resource ownership checks | Client input cannot establish ownership |
| Long-running operations | Queue-backed background workers | Processing is independent of the HTTP request lifecycle |
| External task recovery | Persisted task identity and reconciliation | Known work can be recovered before resubmission |
| Composition retries | Separate source assets and render state | Local retries can reuse persisted assets |
| Credit accounting | Append-only ledger and idempotent transitions | Repeated event delivery does not duplicate eligible mutations |
| Media readiness | Output validation before publication | Readiness depends on a validated artifact |

## System design

Logical product architecture. External services are represented by neutral ports; the public snapshot supplies demo implementations where available.

```mermaid
flowchart TD
    Web["Web · creation, history, editor and export"]
    Identity["Identity boundary"]
    API["API · authentication, ownership and validation"]
    Billing["Billing · entitlements and credit accounting"]
    Payment["Payment boundary"]
    Jobs["Generation and editing services"]
    DB[("PostgreSQL · jobs, assets and ledger")]
    Queue["Redis / BullMQ · asynchronous jobs"]
    Worker["Worker · execution and reconciliation"]
    AI["Music, voice and video adapter ports"]
    Render["FFmpeg / ffprobe · composition and validation"]
    Storage[("Media storage · local or object-backed")]
    Access["API · authorized media delivery"]
    Ops["Health, readiness and metrics"]

    Web -->|"session"| Identity
    Web -->|"typed requests"| API
    API -->|"verify identity"| Identity
    API --> Billing
    Billing -->|"checkout"| Payment
    Payment -->|"verified payment events"| Billing
    Billing -->|"idempotent credit entries"| DB
    API --> Jobs
    Jobs -->|"persist intent and state"| DB
    Jobs -->|"schedule work"| Queue
    Queue --> Worker
    Worker -->|"submit or reconcile tasks"| AI
    AI -->|"callback events"| API
    Worker -->|"persist progress and task identity"| DB
    Worker -->|"persist source assets"| Storage
    Worker --> Render
    Render -->|"validated outputs"| Storage
    Web -->|"poll status and history"| API
    API -->|"read domain state"| DB
    Web -->|"playback and download"| Access
    Access -->|"ownership and asset lookup"| DB
    Access -->|"read media"| Storage
    API -.-> Ops
    Worker -.-> Ops
```

| Boundary | Responsibility |
| --- | --- |
| Web | Creation forms, optional voice onboarding, progress, history, timeline editing and downloads |
| API | Identity verification, ownership, validation, entitlements, job submission and media access |
| Worker | External task execution, reconciliation, asset persistence and media processing |
| Database | Durable domain state, task references, asset metadata and credit transactions |
| Queue | Delivery and retry scheduling; domain completion is recorded in the database |
| Storage | Voice references, generated audio, intermediate assets and validated exports |
| External ports | Generation, identity and payment integrations behind application-facing contracts |

Payment events are verified server-side before accounting changes. Provider callbacks enter the API boundary and require validation; external success alone does not make an export ready. Database writes, queue delivery and external submissions are separate operations.

### Generation, editing and recovery

Conceptual lifecycle; individual entities use their own state models.

```mermaid
flowchart TD
    Request["Creation request · lyrics, optional voice or source media"]
    Gate["Validate ownership, capabilities and credit eligibility"]
    Intent["Persist job identity and operation state"]
    Execute["Asynchronous generation or task reconciliation"]
    Assets["Persist generated assets"]
    Choice{"Requested output"}
    Edit["Audio editing and export"]
    Video["Video composition"]
    Validate["Validate final media"]
    Ready["Ready state and controlled download"]
    Recovery["Retry or reconcile from durable state"]
    Failed["Terminal failure · eligible compensation"]

    Request --> Gate
    Gate --> Intent
    Intent --> Execute
    Execute --> Assets
    Assets --> Choice
    Choice -->|"audio"| Edit
    Choice -->|"video"| Video
    Edit --> Validate
    Video --> Validate
    Validate --> Ready
    Execute -->|"uncertain or retryable outcome"| Recovery
    Recovery -->|"reuse task identity"| Execute
    Video -->|"local render failure"| Assets
    Execute -->|"terminal outcome"| Failed
```

Persisted assets separate external generation from local composition. Composition retries can reuse existing inputs. Recovery reconciles known external work before a replacement submission; delivery is not assumed to be globally exactly-once.

## Architectural patterns

- **Ports and adapters:** domain-facing contracts separate product policy from integration mechanics.
- **Durable workflow state:** retries resume from recorded progress instead of process memory.
- **Idempotency and compensation:** ledger identities and recovery paths address repeated delivery and partial failure. No claim of global exactly-once execution.
- **Feature-oriented frontend:** UI features use a typed API boundary rather than importing persistence or worker internals.
- **Application-owned media:** generated assets become durable inputs to composition instead of relying on expiring external links.
- **Defense in depth:** ownership checks, server-side entitlements, local demo defaults and public-content checks address different trust boundaries.

Read the [architecture](docs/architecture.md), [engineering decisions](docs/engineering-highlights.md), [functional scope](docs/product-overview.md), and [security design](docs/security-design.md).

## Local setup

The source uses Next.js / React / TypeScript, Fastify, PostgreSQL / Prisma, Redis / BullMQ and FFmpeg. These are implementation technologies; commercial AI and payment integrations are represented by neutral demo boundaries.

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:generate
```

For local runtime exploration, provide local PostgreSQL and Redis, then run `pnpm db:push` and `pnpm dev`. Inspect `.env.example` for local ports. No paid account is required for the intended mock flows. Complete end-to-end runtime availability depends on the local database, queue and media tooling; this is not a production deployment distribution.

```bash
pnpm public:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Scope and limitations

This repository demonstrates application architecture, not a foundation model. The private product and this snapshot evolve separately. Security patterns described for the private system are not automatically guarantees of this demo: see the [implementation status](docs/security-design.md).

Commercial-looking fixture values are illustrative demo data. They do not disclose production prices, wholesale costs, margins or capacity. No customer counts, conversion rates, uptime figures or savings percentages are claimed here.

## Authorship

**Dmitriy Sedov** — application design and implementation across frontend, API, asynchronous processing, and media pipelines.

Copyright © 2026 Dmitriy Sedov. Published for portfolio review and technical evaluation. See [NOTICE](NOTICE) for usage restrictions.

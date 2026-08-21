# Security design

## Trust boundaries

- Browser talks only to the application API (and signed media URLs).
- API owns authentication, authorization, billing commits, and enqueue.
- Worker owns irreversible provider side effects after durable commit.
- Secrets stay in server environment variables — never in the web bundle.

## Authorization

- User identity is resolved server-side (Clerk session / JWT).
- Ownership checks gate read/write/delete for generations, tracks, voice profiles, and media.
- Raw storage keys and foreign provider IDs must not bypass ownership.

## Payments and credits

- Checkout creation and callback verification are server-only.
- Credit grants happen only after verified payment state.
- Refunds are state-machine driven and idempotent.
- UI plan gates are UX only; paid routes re-check entitlements and credits on the API.

## Media privacy

- Voice samples, stems, and renders are private by default.
- Playback uses short-lived signed URLs.
- Storage key builders are centralized to avoid ad-hoc path construction.

## Showcase repository policy

This public repository intentionally removes:

- real credentials and webhook secrets
- production infrastructure identifiers
- merchant-specific production configuration
- confidential provider unit economics
- real user / transaction identifiers

Use `SHOWCASE_MODE=true` for local exploration without commercial APIs.

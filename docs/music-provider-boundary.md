# Music provider boundary (PR8)

Server-side contract between vendor adapters and application orchestration.

## Provider responsibilities (`MusicGenerationProvider`)

- `prepareGeneration(input, context)` — build vendor request **without HTTP**
- `submitPreparedGeneration(prepared, context)` — **one** vendor POST after app CAS
- `getGenerationStatus(taskId)` — poll/normalize status → `GenerationStatusResult`
- Apply late-bound `context.callBackUrl` to vendor payload when present
- Classify submit outcomes: `ok` | `failed_terminal` | `retryable_capacity` | `ambiguous`

`PreparedGeneration<TPayload>` is opaque to Worker (`payload: unknown`); adapters keep typed payloads.

## Application responsibilities (API / Worker)

- Credits spend / refund / ledger
- Submission FSM: `queued` → `dispatching` → `submitted` | `submit_unknown` | `failed`
- CAS claim before POST; exactly one POST after claim
- Submit permit / rate limit **before** CAS (`acquireSubmitPermit`)
- Callback HMAC / signed URL construction (pass ready URL via `GenerationSubmitContext.callBackUrl`)
- Callback HTTP routes and FSM status transitions
- BullMQ enqueue, reconciler, persistence, storage, playback

## Neutral generation input (PR8.3)

Core in-memory DTO (`GenerateSongInput`):

- `prompt`, `title?`, `durationSec?`, `mode?: "song" | "instrumental"`, `style?: string`
- `providerOptions?:` discriminated union (`sunoapi` | `mureka` | `mock`)

Suno-only knobs live in `SunoGenerationOptions` inside `providerOptions`:

- `customMode`, `referenceAudioUrl`, `vocalGender`, `personaId`, `personaModel`

HTTP adapter (strategy A) at `POST /api/music/generate`:

- accepts legacy flat fields and/or typed `providerOptions`
- conflicts between legacy and `providerOptions` → **HTTP 400**
- always materializes `providerOptions.providerId = "sunoapi"` for Suno path

Persistence (unchanged in PR8.3):

- `providerRequestJson` remains the **flat** legacy shape via `toPersistedSongInput`
- Worker restores neutral input via `fromPersistedSongInput` (supports old flat rows)
- no `providerRequestJson` v2 envelope yet

## Progress / status UX

- Terminal state: domain `status` (+ `audioPersistence` for ready)
- UX progress: computed `phaseHint` (`queued` | `generating` | `finalizing` | `persisting` | `ready`)
- `rawStatus` is opaque diagnostic only — UI must not map Suno enums (`TEXT_SUCCESS`, …)
- `phaseHint` is **not** stored in DB

## What stays Suno-specific (today)

| Area | Location |
|------|----------|
| HTTP client / models / mappers | `packages/ai-providers/.../suno-api/` |
| Rate limiter | `getSunoRateLimiter` (wired in Worker composition root) |
| Signed callback URL builder | `apps/worker/.../suno-signed-callback-url.ts` |
| Callback HTTP routes + HMAC | `/api/music/callback/suno/...` (app) |
| Vendor callback Zod schema | `suno-api/suno-callback.schema.ts` (**private**, not in `music/index.ts`) |
| Callback normalizer | `SunoMusicCallbackNormalizer` → `NormalizedProviderCallback` |
| Voice persona | `suno-voice` package + API persona services → `SunoGenerationOptions` |
| Env names | `SUNO_*` |

## PR8.1 status

Worker `process-provider-job` depends only on `MusicGenerationProvider` + `acquireSubmitPermit`.  
Suno wiring: `apps/worker/src/music-generate/default-submit-deps.ts`.

## PR8.2 status — Callback normalization

- `MusicGenerationCallbackNormalizer.normalizeCallback(raw)` in `@ai-music/ai-providers`
- Public exports: normalizer interface, `NormalizedProviderCallback`, `SunoMusicCallbackNormalizer` (+ mock)
- Vendor schema stays private under `providers/suno-api/`
- App: route + HMAC + early bind/mismatch + FSM + refund + persistence + `resolveMusicGenerationErrorDisplay`
- Composition root: `apps/api/.../callback/default-callback-normalizer.ts` (Suno-only)
- Order inside normalizer: validate → extract `providerTaskId` → classify
- `failed` = terminal 400/451 only (no `retryable`); transient 500 → `ignored.provider_transient`
- `invalid_payload` → HTTP 400; `ignored` → HTTP 200

## PR8.3 status — Neutral input / UI progress

- Neutral `GenerateSongInput` + typed `providerOptions`
- Legacy HTTP adapter with conflict → 400
- Flat `providerRequestJson` write preserved; dual-read via `fromPersistedSongInput`
- UI progress via `phaseHint`; no Suno `TEXT_SUCCESS` / `FIRST_SUCCESS` in web
- Persona remains Suno-specific capability inside `SunoGenerationOptions`

## Related

- [docs/provider-routing.md](./provider-routing.md) — creation-time vs asset-time (Provider Affinity)

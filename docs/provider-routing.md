# Provider routing: creation-time vs asset-time (Provider Affinity)

**Creation-time routing and asset-time routing are different concepts.**

## A. Creation operations (new independent asset)

Examples: new song, lyrics, Personal AI Voice, independent SFX, future independent cover.

Provider may follow current business policy / user intent:

| Intent | Provider |
|--------|----------|
| My Voice OFF | SunoAPI |
| My Voice ON + ready VoiceProfile | Mureka |
| Lyrics | SunoAPI (lyrics engine) |

`MUSIC_DEFAULT_PROVIDER` must **not** drive song creation when personal-voice routing exists; see `resolveMusicProviderForGeneration`.

### Production Mureka rollout gate

Production Personal Voice is **off by default**. Enabling requires **all** of:

```txt
APP_ENV=production
MUREKA_PRODUCTION_ROLLOUT_ENABLED=true   # default false
MUREKA_ENABLED=true
MUREKA_PERSONAL_VOICE_ENABLED=true
valid MUREKA_API_KEY
valid https MUREKA_BASE_URL
```

SoT: `resolveMurekaPersonalVoiceAvailability` / `isMurekaGenerateRuntimeReady` in `@ai-music/shared`.

With rollout=false (default), production behavior matches “feature disabled”:
VoiceProfile create/get unavailable, My Voice UI hidden (via `GET /api/music/provider-status`), generate blocked before spend. No silent Suno fallback when Personal Voice was requested.

Generate / vocal-clone enqueue additionally requires a **fresh worker Redis heartbeat**
written only while `mureka-provider-jobs` is listening. Missing/stale heartbeat → 503 before spend.

Do **not** set `MUSIC_DEFAULT_PROVIDER=mureka` to “turn on” Mureka songs.

## B. Derived / post-processing (existing asset)

Examples: timestamped lyrics, provider-specific cover, extend (when wired), stem separation that uses provider task/audio ids, provider status/details for a persisted generation.

Provider = **persisted** source:

```txt
track.provider (if present)
  ?? generation.provider
  ?? song.provider
```

**Never:**

- `MUSIC_DEFAULT_PROVIDER` / `MUSIC_PROVIDER`
- `providerFactory.getProvider()` without explicit id
- current My Voice toggle
- silent cross-provider fallback (`try Suno catch Mureka`)

Shared helper: `resolveExistingMusicAssetProvider` in `@ai-music/shared`.

On track vs generation conflict → `MUSIC_PROVIDER_AFFINITY_MISMATCH` (fail closed, no HTTP, no spend).

## Provider ID affinity

| Provider | IDs may only go to |
|----------|--------------------|
| Suno | Suno APIs (`taskId`, `audioId` / `providerTrackId`) |
| Mureka | Mureka APIs (`taskId`, choice id, `vocal_id`) |

## Capability after affinity

```txt
provider = resolveExistingMusicAssetProvider(...)
if !supports(operation) → DOMAIN_OPERATION_UNAVAILABLE
# no auto-fallback to another vendor
```

## Billing order

```txt
load asset → affinity → capability → IDs → spend → provider call
# invalid affinity/capability/IDs → no spend
# provider fail after spend → refundOriginalSpend
```

## Classification cheat sheet

| Operation | Affinity? | Notes |
|-----------|-----------|--------|
| Timed lyrics | **yes** | Suno only today; Mureka → unavailable |
| Album cover variants | **yes** | Suno taskId only; Mureka → unavailable / UI fallback |
| Stem separation (Suno vocal-removal) | **yes** | Uses taskId+audioId; non-Suno → no Suno call |
| Remix (upload-cover from audio URL) | creation-like | New Suno asset from **server-resolved** source track audio; persist `provider=sunoapi`. **No** silent persona / vocal_id / My Voice (v1). |
| Generation status poll | **yes** | `createMusicGenerationProvider(record.provider)` |
| Local editor (split/trim/fade/render/WAV) | **no** | Provider-neutral |
| Future URL-only stems | **no** | If API takes file/URL only |

## Anti-patterns

1. Post-processing via active/default provider (timed-lyrics bug class).
2. Hardcoding `Song.provider = "sunoapi"` while copying Mureka task ids.
3. Returning `resolveMusicProviderId()` for a remix that always submits to Suno.

# Suno Voice persona — LEGACY (historical contract)

**Status:** legacy / not the current Personal AI Voice product path.

Current product Personal Voice:

```txt
Voice sample → Mureka Vocal Clone → VoiceProfile.vocal_id → Mureka song gen
```

This document remains the **verified contract** for the historical Suno custom-voice
(`personaId`) path if that code is touched. Do not use it as the target MVP voice flow.
Do not mix Suno `personaId` with Mureka `vocal_id`.

Cursor rule: [.cursor/rules/suno-voice-persona-contract.mdc](../.cursor/rules/suno-voice-persona-contract.mdc).

Документ фиксирует **проверенный контракт** (prod-like прогон 2026-06-21) для подмены
вокала (`personaId`), `readyForMusicGeneration` и music generate.

## ID glossary (не путать)

| Suno API / dashboard | Колонка БД | Назначение |
| -------------------- | ---------- | ---------- |
| validate/generate `taskId` | `sunoVoiceTaskId` | Polling `validate-info`, `record-info`; после verify хранится **generate** taskId |
| `record-info.voiceId` | `sunoVoiceId` | Persona для music generate (`personaId`) |
| dashboard `resultJson.persona_id` | = `sunoVoiceId` | То же id, другое имя в UI Suno |

**Не путать с** [`POST /generate/generate-persona`](https://docs.sunoapi.org/suno-api/generate-persona) —
persona из **готового трека** (`taskId` + `audioId`). User voice sample flow его **не использует**.

### Правила записи `sunoVoiceId`

1. Берётся **только** из `record-info` при `status === "success"` и **непустом** `voiceId`
   ([`resolveSunoRecordVoiceId`](../apps/api/src/modules/voice-samples/resolve-suno-record-voice-id.ts)).
2. **Запрещено** синтезировать id из `taskId`, если поле `voiceId` пустое — даже когда
   `check-voice({ task_id })` отвечает `true`.
3. **Разрешено** сохранять значение, где `voiceId === taskId`, если оно пришло в
   **непустом** `record-info.voiceId` (подтверждено Suno task `f002cfffb7a5e7e79ffd81e54b0e1205`).

## check-voice: какой метод когда

| Метод | Payload | Когда |
| ----- | ------- | ----- |
| `checkVoiceIdAvailability` | `{ voice_id }` | Диагностика; **не** единственный gate для ready |
| `checkVoiceAvailability` | `{ task_id }`, затем `{ voice_id }` | Fallback |
| **`checkPersonaVoiceAvailability`** | voice_id, затем task_id | **sync ready**, `readyForMusicGeneration`, music generate guard |

Типичный Suno edge case: `record-info.success`, `voiceId === taskId`,
`checkVoiceIdAvailability` = false, **`checkPersonaVoiceAvailability` = true**.
Sync **не должен** ставить `failed` — используется `checkPersonaAvailableWithRetry`
→ `checkPersonaVoiceAvailability`.

Официальная дока: [check-voice](https://docs.sunoapi.org/suno-api/suno-voice-check-voice)
(только `task_id`). Dual-check в клиенте — зафиксированный workaround.

## Единый источник правды (код)

```txt
apps/api/src/modules/voice-samples/resolve-suno-record-voice-id.ts
  resolveSunoRecordVoiceId(recordInfo)  →  voiceId или null

apps/api/src/modules/voice-samples/persona-voice-id.service.ts
  resolvePersonaVoiceId(sample)         →  persona id или null (+ live check)
  isReadyForMusicGeneration(sample, personaVoiceId)

apps/api/src/modules/voice-samples/resolve-suno-voice-persona.ts
  resolveSunoVoicePersonaForUser()      →  persona для music generate

apps/api/src/modules/music/music-persona.ts
  buildPersonaSongInput(), assertSunoPersonaAvailable()

packages/ai-providers/src/suno-voice/suno-voice.client.ts
  checkPersonaVoiceAvailability()

apps/api/src/modules/voice-samples/suno-voice.service.ts
  syncSunoVoiceTaskStatus()             →  ready path + checkPersonaAvailableWithRetry
```

**Запрещено** дублировать resolve/check persona в routes, mapper или web.

### Потребители

| Endpoint / flow | Использование |
| --------------- | ------------- |
| `GET /api/voice-samples` | `toVoiceSampleDtoWithPersonaCheck` → `readyForMusicGeneration` |
| `GET .../suno-voice/status` | то же после sync |
| `POST /api/music/generate` | `resolveSunoVoicePersonaForUser` → `resolvePersonaVoiceId` |
| `syncSunoVoiceTaskStatus` (ready) | `checkPersonaVoiceAvailability` **до** `voiceCloneStatus: ready` |

### Критерий `readyForMusicGeneration: true`

Все условия одновременно:

1. `status === "ready"` (файл образца загружен)
2. `consentConfirmed === true`
3. `voiceCloneStatus === "ready"`
4. `resolvePersonaVoiceId()` вернул не-null (`record-info.voiceId` + live `checkPersonaVoiceAvailability`)

**Не достаточно** только наличия строки в `sunoVoiceId` без live check.

## Flow: от записи до трека

```mermaid
flowchart TD
  A[Главная: upload sample] --> B[VoiceSample status ready]
  B --> C[/consent prepare: validate taskId]
  C --> D[awaiting_verification: фраза Suno]
  D --> E[/consent verify: generate taskId]
  E --> F[cloning: poll record-info]
  F --> G{success and non-empty voiceId}
  G -->|checkPersonaVoiceAvailability OK| H[DB ready plus sunoVoiceId]
  G -->|check fail| I[DB failed]
  G -->|empty voiceId| J[stay cloning no taskId fallback]
  H --> K[readyForMusicGeneration true]
  K --> L[lyrics generate optional]
  L --> M[music generate personaId V5]
  M --> N[2 tracks SUCCESS]
```

## Lyrics vs music generate

| Этап | personaId | vocalGender | model |
| ---- | --------- | ----------- | ----- |
| `POST /api/music/lyrics` | нет | да (род глаголов в prompt) | lyrics API |
| `POST /api/music/generate` | `sunoVoiceId` | **нет** при `voice_persona` | `SUNO_VOICE_MODEL` (V5) |

## Music generate — проверенный Suno payload

Reference payload (custom mode, voice persona, 30s):

```json
{
  "callBackUrl": "<SUNO_CALLBACK_URL>",
  "customMode": true,
  "instrumental": false,
  "model": "V5",
  "personaId": "<sunoVoiceId from record-info>",
  "personaModel": "voice_persona",
  "prompt": "<lyrics Verse/Chorus>",
  "style": "pop, 2000s, nostalgic, bright production, very short 30s track, max 30 seconds",
  "title": "Summer Friends"
}
```

Поля **не должны** появляться при `voice_persona`: `vocalGender`, `Male Vocal` / `Female Vocal` в style.

Формирование: [`buildGenerateRequest`](../packages/ai-providers/src/music/providers/suno-api/suno-api.provider.ts),
[`buildPersonaSongInput`](../apps/api/src/modules/music/music-persona.ts),
[`applySunoDurationHints`](../packages/ai-providers/src/music/providers/suno-api/suno-duration-hints.ts),
[`stripPersonaConflictingStyleTags`](../packages/shared/src/constants/vocal-gender.ts).

Ожидаемый результат Suno: `rawStatus: SUCCESS`, **2 tracks**, длительность близка к `durationSec`.

## Verify generate metadata (Suno Voice)

При `POST /voice/generate` ([verify flow](../apps/api/src/modules/voice-samples/suno-voice.service.ts)):

- `taskId` — validate task (до submit); после verify `sunoVoiceTaskId` = **новый** generate taskId
- `verifyUrl` — запись фразы Suno
- `style` — `Female Vocal` | `Male Vocal` из `User.vocalGender` (только на этапе clone, не music generate)
- `voiceName` — `voice-{sampleId}`

## Что делать при ошибке generate (403 persona)

| Симптом в Network | Действие |
| ----------------- | -------- |
| `readyForMusicGeneration: false`, `voiceCloneStatus: ready` | **Только `/consent`** — «Повторить верификацию». Образец на главной **не** перезаписывать. |
| `POST .../prepare { restart: true }` при stale persona | API сбрасывает task и заново вызывает Suno validate (новая фраза) |
| `voiceCloneStatus: failed` | `/consent` → повторить; если снова fail — новый образец на главной |
| `readyForMusicGeneration: true`, generate OK | Ничего |

### Нужно ли пересоздавать образец?

| Сценарий | Новый upload на главной | Повторная верификация /consent |
| -------- | ------------------------ | ------------------------------ |
| Был `ready`, generate 403, файл образца на месте | **Нет** | **Да** |
| Хотите другой тембр / новая запись | **Да** (заменит образец) | **Да** (автоматически после upload) |
| `voiceCloneStatus: failed` после нескольких попыток | **Да** | **Да** |
| Первичная настройка | **Да** | **Да** |

List API (`GET /api/voice-samples`) при каждом запросе:

- синхронизирует незавершённые task;
- вызывает `resolvePersonaVoiceId({ persistCorrection: true })` — может **исправить**
  `sunoVoiceId` из `record-info` без повторной записи пользователя.

## Пол голоса vs persona

| Механизм | Где | Роль |
| -------- | --- | ---- |
| `User.vocalGender` | lyrics generate, UI hints, Suno Voice verify `style` | Род глаголов / metadata clone |
| `personaId` (`sunoVoiceId`) | music generate | Подмена вокала Suno |

## Запреты для агентов (regression checklist)

- Заменить `checkPersonaVoiceAvailability` на только `checkVoiceIdAvailability` в sync/ready.
- Фильтровать `sunoVoiceId`, когда оно равно `sunoVoiceTaskId`, но пришло из `record-info.voiceId`.
- Подставлять `taskId` в persona при пустом `record-info.voiceId`.
- Отправлять `vocalGender` в Suno music request при `personaModel: voice_persona`.
- Использовать `SUNO_API_MODEL` вместо `SUNO_VOICE_MODEL` при persona.
- Вызывать `/generate/generate-persona` для user voice sample flow.
- Дублировать resolve persona вне allow-list файлов в начале документа.

## Автопочинка и диагностика

```bash
cd apps/api
pnpm exec tsx scripts/check-suno-voice.ts <voice_id_or_task_id>
pnpm exec tsx scripts/fetch-suno-voice-raw.ts <taskId>
pnpm exec tsx scripts/debug-voice-persona.ts <userId>
pnpm exec tsx scripts/debug-suno-persona-music.ts <userId> <personaId>
```

## Связанные файлы

- `.cursor/rules/suno-voice-persona-contract.mdc` — краткий контракт для Cursor agent
- `persona-voice-id.service.ts` — resolve + ready criteria
- `resolve-suno-record-voice-id.ts` — extract voiceId from record-info
- `resolve-suno-voice-persona.ts` — persona для music generate
- `music-persona.ts` — `buildPersonaSongInput`, strip vocal tags
- `.cursor/skills/music-provider-integration/references/suno-voice-flow.md` — UX flow

Официальная документация Suno Voice:

- https://docs.sunoapi.org/suno-api/suno-voice-validate
- https://docs.sunoapi.org/suno-api/suno-voice-generate
- https://docs.sunoapi.org/suno-api/suno-voice-record-info
- https://docs.sunoapi.org/suno-api/suno-voice-check-voice
- https://docs.sunoapi.org/suno-api/generate-music

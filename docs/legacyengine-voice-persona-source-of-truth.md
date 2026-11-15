# Legacyengine Voice persona — LEGACY (historical contract)

**Status:** legacy / not the current Personal AI Voice product path.

Current product Personal Voice:

```txt
Voice sample → Audioengine Vocal Clone → VoiceProfile.vocal_id → Audioengine song gen
```

This document remains the **verified contract** for the historical Legacyengine custom-voice
(`personaId`) path if that code is touched. Do not use it as the target MVP voice flow.
Do not mix Legacyengine `personaId` with Audioengine `vocal_id`.

Cursor rule: [.cursor/rules/legacyengine-voice-persona-contract.mdc](../.cursor/rules/legacyengine-voice-persona-contract.mdc).

Документ фиксирует **проверенный контракт** (prod-like прогон 2026-06-21) для подмены
вокала (`personaId`), `readyForMusicGeneration` и music generate.

## ID glossary (не путать)

| Legacyengine API / dashboard | Колонка БД | Назначение |
| -------------------- | ---------- | ---------- |
| validate/generate `taskId` | `legacyengineVoiceTaskId` | Polling `validate-info`, `record-info`; после verify хранится **generate** taskId |
| `record-info.voiceId` | `legacyengineVoiceId` | Persona для music generate (`personaId`) |
| dashboard `resultJson.persona_id` | = `legacyengineVoiceId` | То же id, другое имя в UI Legacyengine |

**Не путать с** [`POST /generate/generate-persona`](https://integration.example.invalid —
persona из **готового трека** (`taskId` + `audioId`). User voice sample flow его **не использует**.

### Правила записи `legacyengineVoiceId`

1. Берётся **только** из `record-info` при `status === "success"` и **непустом** `voiceId`
   ([`resolveLegacyengineRecordVoiceId`](../apps/api/src/modules/voice-samples/resolve-legacyengine-record-voice-id.ts)).
2. **Запрещено** синтезировать id из `taskId`, если поле `voiceId` пустое — даже когда
   `check-voice({ task_id })` отвечает `true`.
3. **Разрешено** сохранять значение, где `voiceId === taskId`, если оно пришло в
   **непустом** `record-info.voiceId` (подтверждено Legacyengine task `f002cfffb7a5e7e79ffd81e54b0e1205`).

## check-voice: какой метод когда

| Метод | Payload | Когда |
| ----- | ------- | ----- |
| `checkVoiceIdAvailability` | `{ voice_id }` | Диагностика; **не** единственный gate для ready |
| `checkVoiceAvailability` | `{ task_id }`, затем `{ voice_id }` | Fallback |
| **`checkPersonaVoiceAvailability`** | voice_id, затем task_id | **sync ready**, `readyForMusicGeneration`, music generate guard |

Типичный Legacyengine edge case: `record-info.success`, `voiceId === taskId`,
`checkVoiceIdAvailability` = false, **`checkPersonaVoiceAvailability` = true**.
Sync **не должен** ставить `failed` — используется `checkPersonaAvailableWithRetry`
→ `checkPersonaVoiceAvailability`.

Официальная дока: [check-voice](https://integration.example.invalid
(только `task_id`). Dual-check в клиенте — зафиксированный workaround.

## Единый источник правды (код)

```txt
apps/api/src/modules/voice-samples/resolve-legacyengine-record-voice-id.ts
  resolveLegacyengineRecordVoiceId(recordInfo)  →  voiceId или null

apps/api/src/modules/voice-samples/persona-voice-id.service.ts
  resolvePersonaVoiceId(sample)         →  persona id или null (+ live check)
  isReadyForMusicGeneration(sample, personaVoiceId)

apps/api/src/modules/voice-samples/resolve-legacyengine-voice-persona.ts
  resolveLegacyengineVoicePersonaForUser()      →  persona для music generate

apps/api/src/modules/music/music-persona.ts
  buildPersonaSongInput(), assertLegacyenginePersonaAvailable()

packages/ai-providers/src/legacyengine-voice/legacyengine-voice.client.ts
  checkPersonaVoiceAvailability()

apps/api/src/modules/voice-samples/legacyengine-voice.service.ts
  syncLegacyengineVoiceTaskStatus()             →  ready path + checkPersonaAvailableWithRetry
```

**Запрещено** дублировать resolve/check persona в routes, mapper или web.

### Потребители

| Endpoint / flow | Использование |
| --------------- | ------------- |
| `GET /api/voice-samples` | `toVoiceSampleDtoWithPersonaCheck` → `readyForMusicGeneration` |
| `GET .../legacyengine-voice/status` | то же после sync |
| `POST /api/music/generate` | `resolveLegacyengineVoicePersonaForUser` → `resolvePersonaVoiceId` |
| `syncLegacyengineVoiceTaskStatus` (ready) | `checkPersonaVoiceAvailability` **до** `voiceCloneStatus: ready` |

### Критерий `readyForMusicGeneration: true`

Все условия одновременно:

1. `status === "ready"` (файл образца загружен)
2. `consentConfirmed === true`
3. `voiceCloneStatus === "ready"`
4. `resolvePersonaVoiceId()` вернул не-null (`record-info.voiceId` + live `checkPersonaVoiceAvailability`)

**Не достаточно** только наличия строки в `legacyengineVoiceId` без live check.

## Flow: от записи до трека

```mermaid
flowchart TD
  A[Главная: upload sample] --> B[VoiceSample status ready]
  B --> C[/consent prepare: validate taskId]
  C --> D[awaiting_verification: фраза Legacyengine]
  D --> E[/consent verify: generate taskId]
  E --> F[cloning: poll record-info]
  F --> G{success and non-empty voiceId}
  G -->|checkPersonaVoiceAvailability OK| H[DB ready plus legacyengineVoiceId]
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
| `POST /api/music/generate` | `legacyengineVoiceId` | **нет** при `voice_persona` | `LEGACYENGINE_VOICE_MODEL` (V5) |

## Music generate — проверенный Legacyengine payload

Reference payload (custom mode, voice persona, 30s):

```json
{
  "callBackUrl": "<LEGACYENGINE_CALLBACK_URL>",
  "customMode": true,
  "instrumental": false,
  "model": "V5",
  "personaId": "<legacyengineVoiceId from record-info>",
  "personaModel": "voice_persona",
  "prompt": "<lyrics Verse/Chorus>",
  "style": "pop, 2000s, nostalgic, bright production, very short 30s track, max 30 seconds",
  "title": "Summer Friends"
}
```

Поля **не должны** появляться при `voice_persona`: `vocalGender`, `Male Vocal` / `Female Vocal` в style.

Формирование: [`buildGenerateRequest`](../packages/ai-providers/src/music/providers/legacyengine-api/legacyengine-api.provider.ts),
[`buildPersonaSongInput`](../apps/api/src/modules/music/music-persona.ts),
[`applyLegacyengineDurationHints`](../packages/ai-providers/src/music/providers/legacyengine-api/legacyengine-duration-hints.ts),
[`stripPersonaConflictingStyleTags`](../packages/shared/src/constants/vocal-gender.ts).

Ожидаемый результат Legacyengine: `rawStatus: SUCCESS`, **2 tracks**, длительность близка к `durationSec`.

## Verify generate metadata (Legacyengine Voice)

При `POST /voice/generate` ([verify flow](../apps/api/src/modules/voice-samples/legacyengine-voice.service.ts)):

- `taskId` — validate task (до submit); после verify `legacyengineVoiceTaskId` = **новый** generate taskId
- `verifyUrl` — запись фразы Legacyengine
- `style` — `Female Vocal` | `Male Vocal` из `User.vocalGender` (только на этапе clone, не music generate)
- `voiceName` — `voice-{sampleId}`

## Что делать при ошибке generate (403 persona)

| Симптом в Network | Действие |
| ----------------- | -------- |
| `readyForMusicGeneration: false`, `voiceCloneStatus: ready` | **Только `/consent`** — «Повторить верификацию». Образец на главной **не** перезаписывать. |
| `POST .../prepare { restart: true }` при stale persona | API сбрасывает task и заново вызывает Legacyengine validate (новая фраза) |
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
  `legacyengineVoiceId` из `record-info` без повторной записи пользователя.

## Пол голоса vs persona

| Механизм | Где | Роль |
| -------- | --- | ---- |
| `User.vocalGender` | lyrics generate, UI hints, Legacyengine Voice verify `style` | Род глаголов / metadata clone |
| `personaId` (`legacyengineVoiceId`) | music generate | Подмена вокала Legacyengine |

## Запреты для агентов (regression checklist)

- Заменить `checkPersonaVoiceAvailability` на только `checkVoiceIdAvailability` в sync/ready.
- Фильтровать `legacyengineVoiceId`, когда оно равно `legacyengineVoiceTaskId`, но пришло из `record-info.voiceId`.
- Подставлять `taskId` в persona при пустом `record-info.voiceId`.
- Отправлять `vocalGender` в Legacyengine music request при `personaModel: voice_persona`.
- Использовать `LEGACYENGINE_API_MODEL` вместо `LEGACYENGINE_VOICE_MODEL` при persona.
- Вызывать `/generate/generate-persona` для user voice sample flow.
- Дублировать resolve persona вне allow-list файлов в начале документа.

## Автопочинка и диагностика

```bash
cd apps/api
pnpm exec tsx scripts/check-legacyengine-voice.ts <voice_id_or_task_id>
pnpm exec tsx scripts/fetch-legacyengine-voice-raw.ts <taskId>
pnpm exec tsx scripts/debug-voice-persona.ts <userId>
pnpm exec tsx scripts/debug-legacyengine-persona-music.ts <userId> <personaId>
```

## Связанные файлы

- `.cursor/rules/legacyengine-voice-persona-contract.mdc` — краткий контракт для Cursor agent
- `persona-voice-id.service.ts` — resolve + ready criteria
- `resolve-legacyengine-record-voice-id.ts` — extract voiceId from record-info
- `resolve-legacyengine-voice-persona.ts` — persona для music generate
- `music-persona.ts` — `buildPersonaSongInput`, strip vocal tags
- `.cursor/skills/music-provider-integration/references/legacyengine-voice-flow.md` — UX flow

Официальная документация Legacyengine Voice:

- https://integration.example.invalid
- https://integration.example.invalid
- https://integration.example.invalid
- https://integration.example.invalid
- https://integration.example.invalid

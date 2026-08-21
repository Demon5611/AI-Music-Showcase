# Language contracts: voice sample vs lyrics

Оба пути идут через Suno, но **это разные API-контракты**. Не унифицировать allowlist и не ожидать одинакового набора языков в UI.

## Сводка

| | Voice sample (`voiceLanguage`) | Lyrics (`lyricsLanguage`) |
|---|---|---|
| UI | Создание семпла (главная) | Генерация текста (`/music-create`) |
| Код | `packages/shared/src/voice-language/` | `packages/shared/src/lyrics-language/` |
| Поле в БД / API | `VoiceSample.voiceLanguage` | metadata / body `lyricsLanguage` |
| Как уходит в Suno | Параметр `language` в `POST /voice/validate` | Текст внутри `prompt` для `POST /lyrics` |
| Источник списка | **Официальный enum Suno Voice** | **Наш продуктовый allowlist** |
| Гарантия языка | Жёсткая: фраза верификации на выбранном коде | Best-effort: инструкция в prompt, модель может ошибиться |

## Voice sample language

Suno Voice `POST /api/v1/voice/validate` принимает `language` только из документированного набора:

```txt
en, zh, es, fr, pt, de, ja, ko, hi, ru
```

Источник: [Suno Voice Validate](https://docs.sunoapi.org/suno-api/suno-voice-validate).

В продукте:

- Пользователь выбирает язык при создании семпла (дефолт из UI locale, можно переопределить).
- Значение сохраняется в `VoiceSample.voiceLanguage`.
- `prepare` передаёт его в validate; от него зависит язык `sunoValidatePhrase` на `/consent`.
- Consent-фраза (`VOICE_CONSENT_PHRASES`) тоже привязана к этому языку.
- `SUNO_VOICE_LANGUAGE` — только fallback для legacy-строк без `voiceLanguage`.

**Нельзя** расширять UI voice-языков кодами вне enum Suno validate (`ka`, `it`, `uk`, …) — API фразу на них не отдаст.

## Lyrics language

Suno `POST /api/v1/lyrics` **не имеет** поля `language`. Контракт: `prompt` (+ callback), лимит ~200 символов.

В продукте:

- UI allowlist шире (`auto` + коды в `LYRICS_LANGUAGE_VALUES`, включая `ka`, `it`, `pl`, `tr`, `uk`, …).
- Мы резолвим язык и **вставляем инструкцию в prompt**  
  (`Generate all lyrics in {EnglishName}. Do not switch language.`).
- Качество для языков вне «сильных» зон модели — best-effort, не API-гарантия.

См. `packages/shared/src/lyrics-language/`, `apps/api/src/modules/music/service.ts` (`generateLyricsForUser`).

## Почему списки в UI разной длины

1. Voice — жёсткий enum провайдера на validate.
2. Lyrics — нет enum; список = языки, которые мы готовы инструктировать через prompt.
3. Оба вендора — Suno, но endpoints и семантика языка несовместимы один-в-один.

## Правила для агентов / PR

- Не подтягивать `LYRICS_LANGUAGE_VALUES` в select языка семпла «чтобы списки совпали».
- Не подтягивать `VOICE_LANGUAGE_VALUES` как единственный источник для lyrics UI.
- Новый язык для **verify-фразы** — только если появился в официальной доке Suno validate.
- Новый язык для **lyrics** — продуктовое решение + prompt/instruction/тесты; без ожидания поля `language` у `/lyrics`.
- `hi` есть в voice validate, но может отсутствовать в lyrics schema — для recording script тогда `lyricsLanguage: auto` (см. `use-voice-recording-script`).

## Связанные файлы

| Область | Путь |
|--------|------|
| Voice allowlist + consent | `packages/shared/src/voice-language/` |
| Lyrics allowlist + resolve | `packages/shared/src/lyrics-language/` |
| Voice prepare → validate | `apps/api/src/modules/voice-samples/suno-voice.service.ts` |
| Lyrics generate | `apps/api/src/modules/music/service.ts` |
| Voice UI select | `apps/web/src/features/voice/voice-language-select.tsx` |
| Lyrics UI select | `apps/web/src/features/music-create/components/lyrics-language-select.tsx` |
| Voice flow | [.cursor/skills/music-provider-integration/references/suno-voice-flow.md](../.cursor/skills/music-provider-integration/references/suno-voice-flow.md) |

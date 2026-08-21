# Product overview

AI Music helps a user turn an idea or custom lyrics into a finished song,
optionally using a personal AI voice, then edit and export the result.

## Core product flow

```text
Idea or custom lyrics
        ↓
AI song creation request
        ↓
Personal cloned voice or default AI voice
        ↓
Asynchronous track generation
        ↓
Music editing
        ↓
Export / download
```

## Capabilities

- Prompt or custom-lyrics song creation
- Personal voice onboarding for generation
- Asynchronous generation with durable job state
- Generation history and playback
- Integrated timeline / audio editor
- Credit-based monetization for billable AI operations
- Prepaid credit-pack checkout architecture

## What this product orchestrates

The application owns:

- product UX and workflow
- authorization and ownership
- credit accounting
- job lifecycle and retries
- media persistence and signed delivery
- payment verification / refund state machines

Foundation generative models and hosted payment rails are provided by
external vendors through adapter interfaces. This repository demonstrates
the orchestration and production engineering around those vendors.

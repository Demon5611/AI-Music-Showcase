# Product overview

AI Music helps a user turn an idea or custom lyrics into a finished song, optionally using a personal AI voice, edit the result, and then create a short-form share video from the track.

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
Music editing / track result
        ↓
Audio export
        └───────────────→ Share Video / AI Story
                              ↓
                         Template + source media
                              ↓
                         Scene generation
                              ↓
                         FFmpeg composition
                              ↓
                         Vertical MP4
```

## Capabilities

- Prompt or custom-lyrics song creation
- Personal voice onboarding for generation
- Asynchronous generation with durable job state
- Generation history and playback
- Integrated timeline / audio editor
- Credit-based monetization for billable AI operations
- Prepaid credit-pack checkout architecture
- Share Video modes ranging from non-AI motion/photo presentation to AI-generated animation/story flows
- Curated video-template catalog controlled by server-side availability rules
- Multi-scene AI Story orchestration with durable scene state and safe recovery
- Final video composition with the generated song, transitions/overlays, and media validation

## Video generation

The current product architecture supports short-form portrait video generation through a dedicated provider boundary rather than coupling product logic to one model vendor.

Production integrations include CometAPI-backed video paths (including Wan/Sora-family workloads), an explicitly gated BytePlus / Seedance path, and a mock provider used for local/showcase development.

The exact model routing rules, credentials, provider limits, and commercial economics are intentionally excluded from this public repository.

## What this product orchestrates

The application owns:

- product UX and workflow;
- authorization and ownership;
- credit accounting;
- durable job lifecycle and retries;
- scene planning and persisted generation state;
- media composition and validation;
- media persistence and signed delivery;
- payment verification / refund state machines;
- provider routing through stable application interfaces.

Foundation generative models and hosted payment rails are provided by external vendors through adapter interfaces. This repository demonstrates the orchestration and production engineering around those vendors.

# Product overview

AI Music helps a user turn an idea or custom lyrics into a finished song, optionally using a personal AI voice, edit the result, and create a short-form share video from the track.

## Core product flow

```text
Idea or custom lyrics
        ↓
AI song creation request
        ↓
Optional personal-voice workflow
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
                         Async video-generation boundary
                              ↓
                         Application media composition
                              ↓
                         Validated vertical MP4
```

## Capabilities

- prompt or custom-lyrics song creation;
- optional personal-voice onboarding;
- asynchronous generation with durable job state;
- generation history and playback;
- integrated timeline / audio editor;
- credit-based monetization architecture;
- prepaid checkout / refund lifecycle architecture;
- Share Video experiences ranging from non-AI presentation to AI-generated animation/story flows;
- curated video-template catalog with server-side availability rules;
- durable multi-scene job state and recovery concepts;
- application-owned final media composition and validation.

## Video generation

The product architecture supports short-form portrait video generation through a dedicated provider boundary rather than coupling application logic to one model vendor.

Production has used multiple external video-generation systems behind this boundary. The public repository intentionally exposes the interface and mock/demo behavior rather than the production adapters.

Provider-specific model assignment, prompts, payload mapping, fallback policy, credentials, limits, and commercial economics remain private.

## What the application owns

The application owns:

- product UX and workflow;
- authorization and ownership;
- credit accounting;
- durable job lifecycle and recovery;
- application-level generation state;
- media composition and validation;
- media persistence and controlled delivery;
- payment / refund lifecycle state;
- stable provider interfaces.

External foundation models, payment rails, and cloud services are dependencies behind those interfaces. The public showcase demonstrates the application architecture around them without publishing production integration recipes.

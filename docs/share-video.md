# Share Video / AI Story

This document describes the public, intentionally reduced architecture of the short-form video subsystem.

The showcase demonstrates engineering patterns without publishing production provider implementations, proprietary prompts, routing heuristics, commercial configuration, or operational know-how.

## Product scope

The product supports several classes of share-video experiences:

- non-AI motion / photo-based presentation;
- single-image AI animation;
- multi-scene AI Story generation;
- curated templates resolved and authorized by the server.

Exact production template logic and provider-specific creative behavior are private.

## Provider boundary

Video generation is isolated behind a stable `VideoProvider` contract. Product code owns lifecycle and authorization; provider adapters own vendor-specific transport.

The public repository exposes only the architectural boundary and deterministic mock behavior required to understand and demonstrate the design.

```text
Product / Worker
      ↓
VideoProvider interface
      ↓
MockVideoProvider      ← public showcase
      ↓
Production adapters    ← private repository
```

Production has used multiple external image/video generation systems behind this boundary, but provider-specific payload mapping, model selection, endpoints, routing rules, policy workarounds, and fallback logic are intentionally excluded here.

## Durable scene pipeline

```text
Track + source media + selected template
        ↓
Validate ownership / feature gate / billing state
        ↓
Persist video job
        ↓
Create application-level scene plan
        ↓
Submit through VideoProvider
        ↓
Persist external task identity
        ↓
Poll / reconcile until completion
        ↓
Persist generated scene asset
        ↓
Build application-level edit plan
        ↓
FFmpeg composition
        ↓
ffprobe output validation
        ↓
Persist final MP4 and mark ready
```

The diagram intentionally stops at application-level responsibilities. Production prompt construction, scene heuristics, provider selection, model parameters, and creative planning algorithms are not part of the public source.

## Why scene state is persisted

External video generation is slow, asynchronous, and potentially billable. A worker crash after an external provider accepted a task must not automatically create a duplicate submission.

The architecture therefore persists provider task identity and scene state separately from final rendering. Retries can reconcile already submitted work, and rendering can be repeated from durable scene assets.

This separates two important failure domains:

1. **generation failure** — external generation did not complete;
2. **render failure** — generated media exists, but local composition or validation failed.

A render retry should reuse completed assets instead of requesting them again.

## Multi-provider architecture

The application-level scene model is independent of any particular external model vendor. This lets production evolve provider choices without spreading vendor-specific logic through product code.

The public showcase intentionally does not disclose which production provider is assigned to which creative role, how providers are ranked, how fallback works, or which model parameters are selected.

## Edit planning

Generated clips and song audio are composed by an application-owned media pipeline. The public architecture demonstrates that an edit plan can contain concepts such as:

- scene ordering;
- source trim ranges;
- playback timing;
- transition metadata;
- overlay metadata.

Production anti-repetition heuristics, prompt strategy, visual-continuity rules, and other product-specific planning logic are private.

## Templates

The browser selects from a curated catalog rather than directly controlling low-level provider settings.

Template availability is enforced server-side. A modified client request must not be able to activate a disabled or unsupported generation path.

The public repository documents this security boundary but intentionally omits production template-to-provider mappings and private generation directives.

## Media composition

Final video assembly is application-owned rather than delegated entirely to a generation provider.

The media pipeline combines durable generated assets with the track and validates the resulting output before changing the job state to `ready`.

The showcase retains FFmpeg / ffprobe integration concepts because they demonstrate media-pipeline engineering, while production composition presets and creative rules remain private.

## Reliability patterns demonstrated

- background jobs outside the HTTP lifecycle;
- bounded provider concurrency;
- persisted provider/task affinity;
- idempotent external submission semantics;
- polling and reconciliation after uncertain responses;
- durable scene assets;
- render-only recovery;
- final media validation;
- server-authoritative feature/template gates;
- deterministic no-network mock providers.

## Public-showcase boundary

Not included in this repository:

- production provider adapters;
- provider-specific request/response transformations;
- production prompts or prompt templates;
- detailed scene-planning algorithms;
- production routing and fallback rules;
- exact model selection and tuning parameters;
- provider credentials or private endpoints;
- provider balances, quotas, or account configuration;
- exact costs, margins, or package economics;
- private vendor correspondence;
- real external task IDs;
- private user media;
- production admin / treasury implementation details.

The purpose of this repository is to demonstrate architecture, product thinking, and engineering quality without providing a reconstruction-ready copy of the production system.

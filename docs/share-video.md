# Share Video / AI Story

This document describes the public, sanitized architecture of the short-form video feature added after the original showcase snapshot.

Commercial credentials, exact provider pricing, quotas, production endpoints, account-specific limitations, and private operational notes are intentionally omitted.

## Product modes

The Share Video area supports multiple presentation levels:

- non-AI motion / photo-based presentation;
- single-image AI animation;
- multi-scene AI Story generation;
- curated templates that control visual direction and server-approved generation paths.

## Provider boundary

Video generation is isolated behind a provider contract. Business code is responsible for lifecycle and product rules; provider adapters are responsible for vendor-specific submit/poll/download behavior.

The production architecture currently includes:

| Provider boundary | Public description |
| --- | --- |
| CometAPI adapter | Video-generation transport used for Wan/Sora-family workloads |
| Wan-family path | Image-to-video scene generation used by AI Story flows |
| Sora path | Feature-gated hero-scene / experiment path |
| BytePlus / Seedance | Explicitly gated alternative/reserve video provider path |
| Mock provider | Deterministic no-network implementation for development/showcase mode |

The public repository intentionally does not expose provider account configuration, real endpoints where unnecessary, vendor credentials, quotas, or exact routing economics.

## Durable scene pipeline

```text
Track + source image + selected template
        ↓
Validate ownership / feature gates / billing
        ↓
Persist Share Video job
        ↓
Plan scenes and visual continuity
        ↓
Submit scene generation through VideoProvider
        ↓
Persist provider task identity
        ↓
Poll / reconcile until scene completion
        ↓
Persist generated scene clip to application storage
        ↓
Repeat for required scenes
        ↓
Build edit plan
        ↓
FFmpeg final composition
        ↓
ffprobe output validation
        ↓
Persist final MP4 and mark ready
```

## Why scene state is persisted

Video generation has a different cost and latency profile from ordinary HTTP work. A worker crash after a provider accepted a job must not cause an automatic second provider POST.

The architecture therefore stores provider task identity and scene state separately from final rendering. Retries can poll/reconcile existing tasks and final rendering can be repeated from durable scene assets.

This separates two failure domains:

1. **generation failure** — external scene generation did not complete;
2. **render failure** — generated scenes exist, but local composition/validation failed.

A render retry should reuse completed scenes rather than regenerate them.

## Multi-provider AI Story

The production project evolved from a single-provider prototype toward provider-composed stories. A story can route different scene roles through different explicitly enabled provider paths while keeping one durable application-level scene model.

Examples include a higher-fidelity hero scene combined with supporting image-to-video scenes. Exact production routing remains private because it changes with provider quality, policy constraints, availability, and commercial terms.

## Visual continuity and anti-loop editing

Longer social videos may be assembled from several short generated clips. The pipeline tracks source ranges and playback decisions during edit planning so the final result does not simply repeat the same few seconds in an obvious loop.

The planning layer may define:

- scene ordering;
- source trim ranges;
- playback rate;
- transition timing;
- overlay/branding metadata;
- preservation rules for visible source text/branding.

## Templates

The UI uses a curated template catalog rather than giving every low-level model field directly to the browser.

Template availability is enforced server-side. This prevents a client from enabling disabled/unverified provider paths by editing request JSON.

A template can control high-level creative direction while the backend resolves implementation details.

## Media composition

Final video assembly uses FFmpeg-compatible composition rather than relying on the generation provider to produce the finished social artifact.

The application can therefore combine:

- generated scene clips;
- the original/generated song audio;
- transitions;
- timing changes;
- overlays / subtitles / branding elements where applicable.

The output is validated with ffprobe before the job becomes `ready`.

## Reliability patterns demonstrated

- BullMQ jobs outside the HTTP lifecycle;
- per-provider concurrency control;
- persisted provider affinity;
- idempotent provider submit behavior;
- polling and reconciliation after uncertain network responses;
- durable scene storage;
- render-only retry after composition failures;
- final media validation before publish;
- explicit feature gates for experimental provider routes;
- mock provider support for no-network local development.

## Public-showcase safety boundary

Not included in this repository:

- API keys or tokens;
- production/staging endpoints tied to private accounts;
- provider wallet balances or quotas;
- exact cost-per-second / token economics;
- margin calculations or package economics;
- private vendor support correspondence;
- real provider task IDs;
- user-generated private media;
- internal admin/treasury implementation details.

The goal of this public version is to demonstrate architecture and engineering decisions without publishing operational or commercial secrets.

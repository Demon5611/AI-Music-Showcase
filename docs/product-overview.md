# Functional scope

AI Music combines asynchronous media generation, audio editing, and video composition within a single application.

## Workflows

| Workflow | Input | Processing | Output |
| --- | --- | --- | --- |
| Music generation | Prompt or lyrics; optional voice reference | Validation, asynchronous submission, status reconciliation, persistence | Stored track and generation status |
| Audio editing | Stored track and edit operations | Timeline operations and audio rendering | Exported audio |
| Share video | Track, source media, template selection | Asynchronous asset generation, composition, output validation | Stored video artifact |
| Credits and checkout | Authorized purchase or operation request | Payment verification, ledger mutation, eligible compensation | Durable accounting state |

## Application responsibilities

- Server-side authorization, resource ownership and entitlement checks.
- Durable job state, external task identity, retries and reconciliation.
- Credit accounting and payment/refund lifecycle handling.
- Media persistence, composition, validation and controlled delivery.
- Typed API contracts and feature-oriented frontend modules.

External generation and payment systems are accessed through adapters. The public snapshot contains neutral integration labels, demo implementations and illustrative policies. Exact capabilities depend on the supplied adapter; this repository does not provide the private production integrations.

## Operational constraints

Queue delivery can repeat. External responses can be uncertain. Database persistence and queue delivery are separate operations. Idempotent transitions and reconciliation address these failure modes; the system does not assume global exactly-once execution.

Demo prices, balances and limits are fixture data rather than commercial offers. Deployment and security limitations are documented in [security-design.md](security-design.md).

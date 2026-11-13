# Decisions that connect engineering to product value

| Decision | Benefit | Tradeoff / failure mode |
| --- | --- | --- |
| Separate API and worker | Long operations survive browser navigation | More hand-off and reconciliation paths |
| Persist external task identity | Recover known work before resubmitting | An uncertain response needs explicit investigation |
| Append-only credit entries | Trace consumption and compensation | Uniqueness and transaction boundaries still matter |
| Store assets before composition | Render retries can reuse completed work | Storage lifecycle and cleanup become product concerns |
| Neutral integration contracts | Changes stay behind an adapter | A common interface cannot erase real capability differences |
| Validate before readiness | Users receive a usable final artifact | Validation adds processing time and failure states |
| Feature-oriented web modules | Changes remain close to the user workflow | Shared internals can become accidental cross-feature APIs |

## What we deliberately do not promise

Exactly-once delivery across a queue, a database and an external service is not assumed. Idempotency reduces repeated effects; reconciliation addresses uncertain outcomes. This showcase does not claim an atomic database-to-queue hand-off or a fully audited production deployment.

## A safe public narrative

The useful story is why boundaries exist and how failures recover. Provider identities, routing recipes, pricing negotiations and internal operational limits add little to that story and remain outside the public architecture contract.

# ADR-0005: Route by named model profiles, not hardcoded model ids

## Status

Accepted

## Context

Model ids churn, differ per environment, and encode cost/quality/privacy
tradeoffs that belong in configuration, not code. Routing decisions must also be
explainable and auditable after the fact — "why did this run go to that model?"
should have a recorded answer.

## Decision

Requests are routed to named model **profiles** describing roles — for example
`ceo_strategy`, `coding_primary`, `coding_review`, `research`, `local_private` —
defined in `rory/os/config/model-profiles.json`. Each profile names an
environment variable (`model_env`) that supplies the concrete model id at
runtime, so **no model id appears in code**. The `ModelRegistry` loads profiles;
the `Router` is deterministic (same inputs produce the same profile) and persists
every routing decision — task, chosen profile, reason, fallbacks — to the event
ledger. Profiles carry `cost`/`quality`/`latency`/`privacy`/`allowed_risk`, so
routing is policy, not guesswork.

## Consequences

Swapping or upgrading a model is a config/env change, never a code change. Every
route is reproducible and auditable from the ledger. The `privacy` field lets the
router refuse to send restricted/identity-scoped data to a `cloud` profile (see
ADR-0007). The cost is an indirection layer to learn, and profiles must be kept
honest as models change.

## Alternatives considered

- **Hardcode model ids at call sites** — rejected: churns constantly, leaks vendor coupling into logic, and makes routing unauditable.
- **A nondeterministic "smart" router that picks models by heuristic at runtime** — rejected: hard to reproduce, explain, or review. Determinism plus logged reasons was the priority.

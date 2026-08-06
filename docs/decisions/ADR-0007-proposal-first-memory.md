# ADR-0007: Proposal-first durable memory with approval and disputes

## Status

Accepted

## Context

Durable memory shapes every future decision, so a single bad or unauthorized
write has a large blast radius. Identity, preferences, goals, and boundaries must
not change silently, and conflicting claims must not be quietly merged into a
false consensus. Secrets must never land in the memory store at all.

## Decision

Durable memory is written **proposal-first**. A write begins as a proposal; an
approval policy decides whether it auto-commits or requires the owner. Sensitive
scopes — identity, preferences, goals, boundaries, and anything `restricted` —
require explicit owner approval. When a new claim conflicts with an existing one,
the record becomes `disputed` rather than overwriting. Corrections **supersede**
prior facts without erasing them: provenance and history are retained. The
`MemoryRepository` refuses to store secrets (keys, tokens, passwords) outright.

## Consequences

The owner stays in control of who Rory thinks they are and what it is allowed
to do. Contradictions surface as disputes to resolve, not silent drift. Full
provenance means any fact can be traced to its source and correction chain. The
cost: writes are slower and sometimes gated on a human, and the approval policy
and conflict detection must be maintained. Secrets never enter memory by design.

## Alternatives considered

- **Direct last-write-wins memory** — rejected: silent drift, no provenance, one bad write poisons everything downstream.
- **Auto-merging conflicts** — rejected: manufactures false consensus; `disputed` keeps the tension visible until resolved.
- **Storing secrets in memory "for convenience"** — rejected outright; secrets are refused.

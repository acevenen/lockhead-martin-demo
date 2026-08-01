# Memory-write policy

Durable memory is the shared brain's source of truth. It is written
**proposal-first** and governed. Implemented in `jarvis/os/memory/repository.js`.

## Lifecycle
`proposed → active | disputed | superseded | expired | rejected`

1. An agent **proposes** a memory (never writes directly).
2. The system validates schema and provenance.
3. Policy decides: auto-accept, or hold for owner approval.
4. **Identity, preferences, goals, boundaries (constraints), and `restricted`
   memories always require owner approval.**
5. A conflict with an existing active memory of the same (type, scope, subject)
   creates a **`disputed`** item — both are kept and surfaced, never merged.
6. A correction **supersedes** the old record without erasing provenance.
7. Routine task state and operational events are written automatically to the
   operational store (not durable identity memory).

## Confidence & authority
- Inferences carry `confidence: inferred` (or `uncertain`); facts stated by the
  owner carry `stated`.
- The owner's latest explicit statement overrides earlier inferred/stale data.

## Never stored
Passwords, API keys, session cookies, private keys, recovery codes, full payment
data, unnecessary raw conversations, hidden chain-of-thought, or unverified
assumptions presented as fact. The repository **refuses** to store secret-like
values (`SECRET_REFUSED`).

## Sensitivity levels
`public · internal · private · restricted`. `restricted` (and identity-scoped)
data must not be routed to a cloud model profile — the router keeps it local.

## Owner control
Explicit deletion and export paths are documented in
`../../../docs/operations/QUICKSTART.md` so the owner retains control of the
data.

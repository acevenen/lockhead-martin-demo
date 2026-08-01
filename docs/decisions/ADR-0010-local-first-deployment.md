# ADR-0010: Local-first deployment for this phase

## Status

Accepted

## Context

Jarvis handles the owner's identity, goals, and boundaries. In the bootstrap
phase the safest posture is to keep everything on the owner's machine, with no
public attack surface, while avoiding any laptop-specific assumption that would
force a rewrite to scale later.

## Decision

Everything binds to `localhost`. Storage is local SQLite; the MCP transport is
stdio-first. There is no public deployment, no open port, and no cloud dependency
required to run the core loop in this phase. At the same time, all interfaces —
the provider adapter, storage access, MCP tools, the router — are kept portable,
so that storage and workers can later move to a VPS by changing configuration and
transport rather than architecture.

## Consequences

The local attack surface is minimal — there is nothing to reach from the network.
The owner can run, test, and audit the whole system offline. When scaling is
warranted, the migration (see `docs/operations/vps-migration.md`) is a deployment
exercise, not a redesign. The cost: no remote access or always-on availability
yet, which is deferred deliberately.

## Alternatives considered

- **Deploy to a server now for convenience** — rejected: exposes sensitive memory and an acting agent to the network before the governance is battle-tested.
- **Build only for local, with laptop-specific assumptions** — rejected: would force a rewrite to scale. Portable interfaces avoid that at little cost today.

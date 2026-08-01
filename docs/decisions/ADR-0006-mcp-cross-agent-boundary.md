# ADR-0006: MCP as the governed cross-agent boundary

## Status

Accepted

## Context

Multiple agents — and, later, separate processes or hosts — must share the same
brain and task system without handing each other raw database access. We need a
seam that exposes intent-level operations, is authenticated, carries agent
identity, and is portable from a laptop to a server without redesign.

## Decision

The Model Context Protocol (MCP) is the cross-agent seam. Agents interact through
narrow, governed MCP tools — propose memory, create a task, submit a review, read
scoped memory, and so on — **never raw SQL or direct database handles**.
Transport is **stdio-first** for the local phase, so there are no open ports;
authenticated HTTP is the documented option for a later VPS. This phase does
**not** modify the user's global Claude or Codex MCP configuration.

## Consequences

Every cross-agent action passes through a validated, permissioned, logged tool,
so the same governance — scopes, schema validation, agent identity, approval
gates — applies no matter which agent calls it. Moving a worker to another host
changes the transport, not the tool contracts. The cost: the tool surface must be
designed and maintained, and a missing tool blocks a workflow until it is added,
which is the intended deny-by-default failure mode.

## Alternatives considered

- **Shared direct DB access between agents** — rejected: no governance, no identity, trivial to corrupt state; defeats the append-only and approval guarantees.
- **A bespoke RPC protocol** — rejected: reinvents MCP, which the surrounding ecosystem already speaks.
- **Editing the user's global MCP config now** — rejected: intrusive and out of scope for this phase.

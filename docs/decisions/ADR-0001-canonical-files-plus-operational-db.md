# ADR-0001: Canonical human-readable files plus an operational database

## Status

Accepted

## Context

Jarvis needs two very different kinds of persistence. It needs durable memory —
identity, preferences, goals, boundaries, decisions, lessons — that a person
should be able to read, diff, and approve. It also needs fast operational state:
tasks, events, routing decisions, review outcomes. A single giant system prompt
does not scale, cannot be diffed, bloats context, and rots silently with no
provenance. A raw chat/transcript log is unauditable — you cannot tell a durable
fact from a passing remark, and correcting one means rewriting history.

## Decision

Use two stores with distinct jobs. Canonical, human-readable truth lives in
version-controlled Markdown under `jarvis/brain/` — the durable facts a person
can read, diff, and approve in a pull request. Operational state lives in a
SQLite database (`jarvis/data/jarvis.db`, gitignored): tasks, the append-only
event ledger, memory rows, routing decisions, reviews. The database is machine
truth for the running system; the brain files are the canonical human record,
and memory promotion writes to both on approval.

## Consequences

Durable facts get code-review-grade change control and provenance. Operational
data stays fast and queryable without bloating git history. The two stores must
be kept coherent, and a backup means capturing both git (files) and a DB export.

## Alternatives considered

- **One giant system prompt** — rejected: unversioned, unreviewable, context-bloating, no provenance.
- **A raw chat/transcript log as memory** — rejected: no separation of fact from chatter, no correction path, poor auditability.
- **DB-only, no human files** — rejected: durable truth becomes opaque and un-reviewable by a human.

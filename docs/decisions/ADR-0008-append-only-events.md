# ADR-0008: An append-only event ledger as the system's spine

## Status

Accepted

## Context

A multi-agent system that can take actions needs an audit trail you can trust
after the fact — one that agents cannot quietly rewrite to make themselves look
good, and that survives partial failures. Reports and dashboards must be
reconstructible, not authoritative on their own.

## Decision

All meaningful actions are recorded as events in an append-only ledger
(`events/EventLedger`): task transitions, routing decisions, memory
proposals and approvals, reviews, board runs. Events are **only appended** — no
update, no delete. Derived views — the board meeting, status, dashboards — are
computed from the ledger and are fully rebuildable from it. Every event carries
the acting agent's identity and a timestamp.

## Consequences

There is one authoritative, tamper-evident history of what actually happened. Any
derived view can be dropped and recomputed, so a corrupted report is a cosmetic
problem, not a data-loss problem. Auditability and disaster recovery both lean on
this ledger — it is the thing to back up and export. The cost: storage grows
monotonically (mitigated by export/compaction later), and code must express
corrections as new events, never edits.

## Alternatives considered

- **Mutable state tables as source of truth** — rejected: history can be silently rewritten, and a bad write is unrecoverable.
- **Trusting agent-authored summaries as the record** — rejected: agents can be wrong or self-serving (see ADR-0009); the ledger, not the summary, is truth.
- **Plain log files only** — rejected: not queryable or schema-validated.

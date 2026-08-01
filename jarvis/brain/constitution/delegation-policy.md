# Delegation policy

The CEO orchestrates; it does not perform every task. It may do a small task
directly when delegation would add more overhead than value — and it records
that routing decision either way.

## Bounds (enforced in `jarvis/os/tasks/engine.js`)
- **Maximum delegation depth**: configurable (default 4). A child beyond the
  ceiling is rejected (`DELEGATION_LIMIT`).
- **Maximum retries**: configurable (default 2). A `failed → queued` retry past
  the limit is rejected (`RETRY_LIMIT`).
- **Timeout / lease**: every task carries a `budget.timeout_ms` (default 5 min).
- **Budget**: every run may carry `max_tokens` / `max_usd`; usage is recorded.
- **No uncontrolled loops**: recursive task creation is depth-limited.

## Routing (enforced in `jarvis/os/routing/router.js`)
Each task is routed to an agent + model profile by a deterministic policy that
considers, in order: data egress/sensitivity, required capabilities and task
type, task risk, quality need, then a stable tie-break. Every decision is
persisted with its constraints and the alternatives considered.

## Escalation
A blocked agent escalates with evidence rather than looping. Anything covered by
`approval-policy.md` is surfaced to the owner, not executed.

## Reviewer separation
The worker and the reviewer are different agents for consequential work
(`review-policy.md`). The CEO chooses a reviewer whose role is in the worker's
`reviewer_roles`.

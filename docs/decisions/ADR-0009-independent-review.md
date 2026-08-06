# ADR-0009: Independent review; no self-approval of high-risk output

## Status

Accepted

## Context

"Done" must mean more than the worker saying so. An agent grading its own
high-risk work is a conflict of interest, and a system that depends on one
specific external reviewer being online is fragile.

## Decision

Review requires reviewer separation. An agent cannot be the sole approver of its
own high-risk output; the `ReviewEngine` enforces that a high-risk item is
accepted only by a party other than its author. **Completion** means the
acceptance criteria were verified by someone other than the worker — not merely
that work was produced. Codex is the **preferred** independent technical
reviewer, but the system never **depends** on it being online: review can fall
back to another eligible agent or the owner, and unreviewed high-risk work simply
does not reach `completed`.

## Consequences

High-risk output gets at least two sets of eyes, and completion is a verified
state, not a claim. The board and status trust the review record, not the
worker's word. The cost: throughput drops when reviewers are scarce, and work can
stall in `awaiting-review` — which is the correct, safe failure. Reviewer
eligibility rules must be maintained.

## Alternatives considered

- **Self-attested completion** — rejected: no independence, easy to game, and it undermines the whole point of the ledger and board.
- **A hard dependency on one external reviewer (always Codex)** — rejected: single point of failure. Preferred-but-optional keeps liveness without sacrificing the separation rule.

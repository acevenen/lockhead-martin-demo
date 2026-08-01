# Review policy

Consequential work is reviewed by someone other than the worker. Implemented in
`jarvis/os/review/engine.js`.

## Rules
- An agent **cannot be the sole approver of its own high-risk output**
  (`high`/`critical` risk). Attempting it raises `SELF_APPROVAL`.
- Code changes require automated checks **and** a reviewer.
- Research claims require cited sources or an explicit statement of uncertainty
  (owned by `research-reviewer`).
- External actions require human approval (`approval-policy.md`).
- Routing-policy changes require evaluation evidence.
- Memory-policy changes require human approval.
- A reviewer may **approve**, **request changes**, or **escalate**.
- **Completion means the acceptance criteria were verified** against evidence —
  not merely that the worker said it was done.

## Record
Every review is stored with: task, artifacts, worker, reviewer, criteria,
findings, evidence, decision, required changes, timestamp. The decision
propagates to the reviewed artifacts' `review_state`.

## Preferred reviewers
- **Technical work** → `cto-codex` (Codex) when available; the system never
  depends on Codex being online, so `qa-reviewer` is the always-available
  fallback.
- **Acceptance criteria** → `qa-reviewer`.
- **Research/evidence** → `research-reviewer`.

# Handoff protocol

Agents pass work through a **validated handoff envelope**. Both Claude Code and
Codex operate from this same neutral contract. The envelope is validated against
the `handoff` schema (`jarvis/os/contracts/schemas.js`) and stored by
`jarvis/os/handoff/store.js`; a malformed or under-specified handoff is rejected.

## Envelope

```json
{
  "handoff_id": "stable unique id",
  "task_id": "parent task id",
  "from_agent": "agent id",
  "to_agent": "agent id or role",
  "objective": "bounded objective",
  "status": "ready|blocked|review_requested|completed",
  "summary": "concise factual summary",
  "changes": [{ "artifact": "path or artifact id", "description": "what changed" }],
  "decisions": [{ "decision": "decision made", "reason": "concise rationale", "evidence": ["artifact or event ids"] }],
  "assumptions": [],
  "verification": { "commands_or_checks": [], "result": "passed|failed|partial|not_run" },
  "risks": [],
  "open_questions": [],
  "recommended_next_action": "one concrete action",
  "created_at": "ISO-8601 timestamp"
}
```

## Rules
- **Bounded objective** — one clear thing, not a project.
- **Factual summary** — what happened, not intentions. No hidden reasoning.
- **Decisions carry evidence** — reference artifact/event ids.
- **Verification is honest** — `not_run` is a valid, respected answer; don't claim
  `passed` without a check.
- **One recommended next action** — the receiver should know exactly what to do
  next.

## Before consequential work, read
Mission & active goals · approval policy · memory-write policy · delegation
policy · relevant project state · **active lessons for this task** · this
protocol. (`CLAUDE.md` / `AGENTS.md` point here.)

# Connect Codex as CTO / independent reviewer

Codex joins as `cto-codex` — architecture, implementation, debugging, tests, and
**independent technical review**. The system never assumes Codex is online;
`qa-reviewer` is the always-available fallback. **Do not assume Codex's
capabilities** — configure only what is verified.

## Authentication
- Use Codex's **officially supported** auth via an explicit environment variable
  (e.g. `OPENAI_API_KEY`). **Never** reuse Claude Code's interactive credentials
  as an application credential.
- Keys live in the environment, never in the repo. `.env.example` lists names.

## Wiring (when you approve)
1. Point the `coding_primary` / `coding_review` model profiles at Codex by
   setting their env vars (`RORY_MODEL_CODING`, `RORY_MODEL_CODE_REVIEW`) to
   the concrete model ids — no code change (that's the whole point of profile
   routing).
2. Give Codex the same MCP tool surface as Claude Code
   (`connect-claude-code.md`), with `caller: 'cto-codex'`.
3. Codex reads `AGENTS.md` first — the shared, model-neutral contract.

## Review handoff
- Route code work to a worker, then submit the review as `cto-codex` via
  `review_submit`. Reviewer separation is enforced: Codex cannot approve its own
  high-risk output.
- Independent review is requested specifically on: the schema validator subset,
  the router's fallback logic, the memory conflict/supersession rules, and the
  task state machine (see `docs/handoffs/CODEX_HANDOFF.md`).

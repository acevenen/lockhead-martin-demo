# Owner handoff

## What this is
The first working foundation of Jarvis — your shared-brain AI company — built
locally inside this repo. It runs, it's tested, and **nothing has been committed
or pushed**: per your operating principles, that waits on your approval.

## What you can do right now (no keys, no setup)
```bash
cd jarvis/os
node cli/jarvis.js demo:e2e   # watch the company plan, route, review, learn, and report
node --test                   # 48 tests pass
node cli/jarvis.js board      # generate today's board meeting
```

## What was built
- A governed **shared brain**: canonical files in `jarvis/brain/` + an operational
  SQLite store, with proposal-first memory, approval gates, and an append-only
  audit ledger.
- A **task/agent/artifact/review** system with a deny-by-default state machine,
  reviewer separation, and delegation/retry/budget caps.
- **Model-profile routing** (models chosen by config/env, never hardcoded) and
  provider adapters that fail closed until you configure them.
- A **learning loop**: failures → lessons that activate only when verified.
- A **daily board meeting** that reads the ledger for the last 24h and scores the
  day's actions.
- Your **existing agents** normalized into a company roster — originals in
  `.claude/agents/` untouched.
- The **hologram project** onboarded with a charter, milestones, and acceptance
  tests, plus a mocked end-to-end run that proves the whole flow.

## What needs YOU
1. **Approve committing this** (or tell me to adjust first). It's uncommitted
   working-tree state right now.
2. **Fill your profile** — `jarvis/brain/profile/*` has honest `unknown`s, not
   guesses. Correct them or approve proposed memories.
3. **Decide where the hologram code lives** (D-2 in the project decisions).
4. Later, and only when you say so: connect real models (env vars), wire the MCP
   server, and schedule the board meeting.

## What I did NOT do (by your rules)
No commit/push, no deploy, no VPS, no public exposure, no secrets in the repo, no
external calls, no hardware purchases, no changes to your global Claude/Codex
config, and no rewriting of your existing HUD, agents, or `CLAUDE.md` (only an
additive pointer).

Full next steps: `docs/operations/NEXT_ACTIONS.md`. For a technical deep-dive and
review requests: `docs/handoffs/CODEX_HANDOFF.md`.

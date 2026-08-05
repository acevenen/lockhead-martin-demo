# Codex handoff

## Objective
You are `cto-codex` — CTO / independent technical reviewer for Rory, a
local-first multi-agent control plane. Read `AGENTS.md` first (the neutral shared
contract), then this.

## Current architecture
- Zero-dependency ESM JS on Node 22 built-ins (`node:sqlite`, `node:test`).
- Canonical human-readable brain in `rory/brain/`; operational SQLite store in
  `rory/data/rory.db`. Full map: `docs/architecture/overview.md`.
- Decisions of record: `docs/decisions/ADR-0001..0011`.

## Important file locations
- Contracts + validator: `rory/os/contracts/{schemas.js,validator.js,enums.js}`
- State machine: `rory/os/tasks/engine.js`
- Governed memory: `rory/os/memory/repository.js`
- Deterministic router: `rory/os/routing/router.js` + `config/model-profiles.json`
- Review gate: `rory/os/review/engine.js`
- Learning loop: `rory/os/learning/repository.js`
- Orchestrator + mocked scenario: `rory/os/orchestrator/{ceo.js,scenario.js}`
- Board meeting: `rory/os/board/meeting.js`
- MCP boundary: `rory/os/mcp/{descriptors.js,tools.js}`
- Tests: `rory/os/test/*.test.js` (48 passing)

## What was implemented
Contracts + validation, task state machine (deny-by-default, delegation/retry
caps), proposal-first governed memory (approval policy, conflict→disputed,
supersession, FTS5, secret refusal), agent registry + normalized manifests,
artifacts, review gate (reviewer separation), failure/lesson loop (verify-before-
active), model-profile routing, provider adapters (mock default; real ones fail
closed), CEO orchestration loop, board meeting + action plan, MCP tool boundary,
handoff envelope. One mocked end-to-end workflow passes.

## What remains
See `docs/operations/NEXT_ACTIONS.md`. Notably: wire the MCP SDK transport,
implement one real provider `complete()`, hologram Milestone 1, board scheduler.

## Tests & current failures
`cd rory/os && node --test` → **48 pass, 0 fail**. No known failures.

## Decisions that must be preserved
- Model ids are **never** hardcoded — route by profile, resolve from env
  (ADR-0005).
- Durable memory stays **proposal-first**; identity/goals/restricted need owner
  approval (ADR-0007).
- The event ledger is **append-only** (ADR-0008).
- High-risk output is **never self-approved** (ADR-0009).
- Real providers **fail closed**; never use interactive credentials (ADR-0004).
- Preserve the existing repo — originals in `.claude/agents/` and the `rory/`
  HUD are untouched (ADR-0011).

## Independent review requested on
1. The JSON-Schema **validator subset** (`contracts/validator.js`) — is any
   keyword I rely on mishandled?
2. The router **fallback chain** (`routing/router.js#selectProfile`) — can it ever
   pick a cloud profile for identity/restricted data?
3. Memory **conflict/supersession** rules (`memory/repository.js`) — any path that
   silently overwrites instead of disputing?
4. The task **state machine** (`tasks/engine.js`) — any illegal transition that
   slips through, or a retry/delegation bound that can be bypassed?

## Next bounded task for you
Review #2 (router fallback for restricted data) and either confirm it's sound or
submit a `review_submit` with `changes_requested` and a failing case. Then, if
approved by the owner, implement the MCP stdio server (`connect-codex.md`).

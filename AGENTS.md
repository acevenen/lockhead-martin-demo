# AGENTS.md — shared contract for coding agents (Codex & others)

This repository is **Rory**, a local-first multi-agent system. Codex operates
here as **CTO / independent technical reviewer** (`rory/brain/agents/registry/cto-codex.json`).
Keep model-specific instructions thin; the shared brain is the source of truth.

## Before consequential work, read
1. `rory/brain/constitution/mission.md` and `rory/brain/goals/active-goals.md`
2. `rory/brain/constitution/approval-policy.md` — what needs the owner
3. `rory/brain/constitution/memory-policy.md` — durable writes are proposal-first
4. `rory/brain/constitution/delegation-policy.md` and `review-policy.md`
5. The relevant project state (e.g. `rory/brain/projects/hologram/`)
6. Active lessons for your task (`rory/os/learning` → `LessonBook.relevant`)
7. `docs/handoffs/protocol.md` — the handoff envelope

## Ground rules
- **Preserve before changing.** Existing/uncommitted work is the owner's. No
  destructive git/fs commands. No commit/push/deploy without approval.
- **Secrets never enter the repo.** Env vars only; `.env.example` holds names.
- **Completion means verified** against acceptance criteria by someone other than
  the worker. High-risk output can't be self-approved.
- **Reviewer role:** Codex is the preferred independent technical reviewer, but
  the system never assumes Codex is online. Do not fabricate capabilities.

## The control plane
- Code: `rory/os/` (plain ESM JS, Node 22 built-ins, zero deps).
- Tests: `cd rory/os && node --test` (or `npm test`). 45 tests, no API keys.
- Try it: `node cli/rory.js demo:e2e` (mocked end-to-end, safe).
- Connect Codex over MCP: `docs/operations/connect-codex.md` (do not modify global
  config without approval).

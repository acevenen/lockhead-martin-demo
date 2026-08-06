# Next actions

Prioritized, bounded next steps. Phases 0–5 of the bootstrap are implemented and
tested; these carry it forward. Nothing here has been committed — see
`OWNER_HANDOFF.md` for the approval gate.

## Highest leverage (do first)
1. **Approve the bootstrap into version control.** Review the diff, then approve a
   commit/push. Until you do, this is uncommitted working-tree state (per your
   "no commit without approval" rule).
2. **Populate the profile.** Fill `rory/brain/profile/{identity,preferences,
   boundaries}.md` (currently honest `unknown`s) or approve proposed memories.
   This unblocks personalized routing and the board's goal tracking.
3. **Pick the hologram code location** (decision D-2 in
   `rory/brain/projects/hologram/decisions.md`) so Milestone 1 can start.

## Build-forward (bounded tasks for the company)
4. **Hologram Milestone 1** — real browser spike: `getUserMedia` + MediaPipe Hands
   landmarks at >15fps. (Task T1 in the hologram backlog.)
5. ~~**Wire the MCP server transport**~~ — **DONE, zero-dependency.** A stdio
   JSON-RPC server ships at `rory/os/mcp/server.js` (`node cli/rory.js mcp`),
   verified by `test/mcp-server.test.js`. No SDK was added — it runs on node
   built-ins, preserving the zero-dep property. Remaining owner step: register it
   project-scoped in your MCP client (`connect-claude-code.md`).
6. **Connect a real model** — set `RORY_MODEL_*` env vars and implement one
   provider adapter's `complete()` against its official SDK (start with the CEO
   or coding profile). Keep the mock as the test default.
7. **Board scheduler** — a local cron/agent to run `board` each morning
   (America/Los_Angeles). Design in `vps-migration.md`; keep local for now.

## Housekeeping
8. Add `.pytest_cache/` and `rory/data/` DB artifacts to `.gitignore` (done in
   this bootstrap).
9. Hermes: fill `docs/integrations/hermes-capability-inventory.md` before any
   integration.

## Explicitly NOT next (needs owner decision / approval)
- No VPS deploy, no public exposure (localhost only this phase).
- No commit/push until #1 is approved.
- No hardware purchase for the hologram reflector.

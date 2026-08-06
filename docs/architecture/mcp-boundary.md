# MCP boundary

Other agents (Claude Code, Codex, and later Hermes) reach the shared brain
through a **narrow set of governed tools**, never raw database access. This is
the seam that keeps the control plane safe and portable.

## Design
- **Tools, not tables.** The surface is the list in
  `rory/os/mcp/descriptors.js`; handlers are in `rory/os/mcp/tools.js`. Each
  handler goes through the same repositories (and therefore the same contracts,
  approval policy, scope checks, and event logging) that the CLI uses.
- **Caller identity on every call.** `makeTools(ctx, { caller })` binds the
  calling agent; writes record who did them; memory reads are filtered to the
  caller's `memory_read_scopes` (the owner has full access).
- **Fails safe.** Unknown scopes are denied; secret-like memory is refused;
  high-risk output can't be self-approved; malformed input fails validation.
- **Transport is separate.** These handlers are transport-agnostic. The outer
  layer — the official MCP SDK over **stdio** locally, authenticated **HTTPS**
  for a VPS later — is a thin wrapper added at connect time. Swapping transport
  never touches the governed logic.

## Tools exposed
`memory_search · memory_get · memory_propose · memory_dispute · goal_list ·
project_get · task_create · task_get · task_update · task_list ·
artifact_register · artifact_get · agent_list · agent_get · handoff_create ·
handoff_get · lesson_search · review_submit · board_generate · system_status`

## This phase
Scaffold only — the governed handlers exist and are tested
(`rory/os/test/mcp.test.js`). Binding a live stdio server and wiring it into
Claude Code / Codex is an owner-approved connect step
(`../operations/connect-claude-code.md`, `../operations/connect-codex.md`). The
owner's **global** MCP config is not modified in this phase.

# Connect Claude Code to the Rory brain (MCP)

**Do not modify your global Claude config.** Register the server **project-scoped**
only, and only when you're ready. Registering it is the one step left to you — the
server itself is already built and tested.

## What's already built
A **zero-dependency** MCP server at `rory/os/mcp/server.js` exposes the governed
tools in `docs/architecture/mcp-boundary.md` over **stdio** (localhost, no network,
newline-delimited JSON-RPC 2.0). It runs on node built-ins — no MCP SDK, no
`npm install`, no build step — so it keeps the control plane's zero-dependency
property. It routes every call through the same scope + approval-checked handlers
(`makeTools`), never raw database access.

Run it directly to see it work:
```bash
cd rory/os
node cli/rory.js mcp        # or: node rory/os/mcp/server.js
```

## Connect it (when you're ready)
1. Register it in **your** Claude Code MCP settings — project scope, not global:
   ```jsonc
   // .mcp.json (project)
   {
     "mcpServers": {
       "rory": {
         "command": "node",
         "args": ["rory/os/cli/rory.js", "mcp"],
         "env": { "RORY_DB_PATH": "<abs path to your persistent DB>", "RORY_MCP_CALLER": "claude-code" }
       }
     }
   }
   ```
   - `RORY_DB_PATH` — the persistent DB the daemon/HUD share (omit to use the default). 
   - `RORY_MCP_CALLER` — the agent id whose read scopes + risk ceiling apply. Omit
     for `owner` (full access). Use a specific agent id to sandbox a client.
2. Confirm the tools resolve by calling `system_status` from the client.

## Guardrails
- Localhost/stdio only; nothing binds to a public interface.
- The server enforces caller scope and approval policy — it is not a database
  shell. Identity/goals/restricted memory still need owner approval.
- No secrets in the config; the server reads its DB path from `RORY_DB_PATH` and
  never borrows Claude Code's interactive credentials.

## Verified
`cd rory/os && node --test test/mcp-server.test.js` — spawns the real server and
drives the full handshake (initialize → tools/list → tools/call read+write →
error paths) over stdio. 4 tests, part of the 60-test suite.

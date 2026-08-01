# Connect Claude Code to the Jarvis brain (MCP)

**Do not modify your global Claude config as part of this bootstrap.** This is
the future connect step, documented so it's ready when you approve it.

## What you'll add
A local MCP server that exposes the governed tools in
`docs/architecture/mcp-boundary.md` over **stdio** (localhost, no network).

## Steps (when you're ready)
1. Add the transport dependency in `jarvis/os/` (the one external dep, at connect
   time only): the official MCP SDK. Until then the handlers run dependency-free.
2. Create a thin `jarvis/os/mcp/server.js` that:
   - opens the context (`createContext`),
   - builds `makeTools(ctx, { caller: 'claude-code' })`,
   - registers each `TOOL_DESCRIPTORS` entry with the SDK server,
   - serves over stdio.
3. Register it in **your** Claude Code MCP settings (project scope, not global):
   ```jsonc
   // .mcp.json (project)
   { "mcpServers": { "jarvis": { "command": "node", "args": ["jarvis/os/mcp/server.js"] } } }
   ```
4. Confirm with `system_status` that the tools resolve.

## Guardrails
- Localhost/stdio only; nothing binds to a public interface.
- The server enforces caller scope and approval policy — it is not a database
  shell.
- No secrets in the config; the server reads its DB path from `JARVIS_DB_PATH`.

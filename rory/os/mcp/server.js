// Zero-dependency MCP server over stdio (newline-delimited JSON-RPC 2.0).
//
// Exposes the governed tool boundary (descriptors.js + tools.js) so an MCP
// client — Claude Code, Codex — reaches the shared brain through the SAME
// scope/approval-checked handlers the rest of the OS uses, never raw DB access.
//
// Built on node built-ins only (node:readline), consistent with the zero-external
// -dependency control plane. No MCP SDK, no build step, no install. The stdio
// transport here is the "thin outer layer" the descriptors always anticipated.
//
// Run:   node cli/rory.js mcp        (or:  node mcp/server.js)
// Wire:  point an MCP client's stdio server command at the above; set
//        RORY_DB_PATH to the persistent DB and RORY_MCP_CALLER to the agent id
//        (defaults: default DB, caller "owner" = full access).

import readline from 'node:readline';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext } from '../core/context.js';
import { loadAgents } from '../agents/loader.js';
import { makeTools } from './tools.js';
import { TOOL_DESCRIPTORS } from './descriptors.js';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'rory-brain', version: '0.1.0' };
const logErr = (...a) => process.stderr.write('[rory-mcp] ' + a.join(' ') + '\n'); // stderr only — stdout is the protocol channel

export function startMcpServer({
  input = process.stdin,
  output = process.stdout,
  path = process.env.RORY_DB_PATH,
  caller = process.env.RORY_MCP_CALLER || 'owner',
  exitOnClose = true,
} = {}) {
  const ctx = createContext({ path });
  if (ctx.agents.list({}).length === 0) loadAgents(ctx); // idempotent-ish: only seed an empty store
  const tools = makeTools(ctx, { caller });

  const send = (msg) => output.write(JSON.stringify(msg) + '\n');
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

  async function handle(msg) {
    const isNotification = msg.id === undefined || msg.id === null;
    const { method, params = {}, id } = msg;
    try {
      switch (method) {
        case 'initialize':
          return reply(id, {
            protocolVersion: params.protocolVersion || PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
          });
        case 'notifications/initialized':
        case 'initialized':
          return; // client ack — no response
        case 'ping':
          return reply(id, {});
        case 'tools/list':
          return reply(id, {
            tools: TOOL_DESCRIPTORS.map((d) => ({
              name: d.name,
              description: d.summary,
              inputSchema: { type: 'object', additionalProperties: true },
              annotations: { title: d.name, readOnlyHint: !d.write },
            })),
          });
        case 'tools/call': {
          const fn = tools[params.name];
          if (typeof fn !== 'function') return fail(id, -32602, `unknown tool: ${params.name}`);
          try {
            const result = await fn(params.arguments || {});
            return reply(id, { content: [{ type: 'text', text: JSON.stringify(result ?? null) }], isError: false });
          } catch (err) {
            // Tool-execution failures (scope/approval/validation) are returned in-band
            // with isError:true — the MCP convention — not as JSON-RPC protocol errors.
            return reply(id, { content: [{ type: 'text', text: `${err.code ? err.code + ': ' : ''}${err.message}` }], isError: true });
          }
        }
        default:
          if (isNotification) return;
          return fail(id, -32601, `method not found: ${method}`);
      }
    } catch (err) {
      if (isNotification) logErr('notification error:', err.message);
      else fail(id, -32603, err.message);
    }
  }

  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  rl.on('line', (line) => {
    const s = line.trim();
    if (!s) return;
    let msg;
    try { msg = JSON.parse(s); } catch { return fail(null, -32700, 'parse error'); }
    if (Array.isArray(msg)) msg.forEach(handle); // JSON-RPC batch
    else handle(msg);
  });

  const shutdown = () => { try { ctx.close(); } catch { /* already closed */ } };
  rl.on('close', () => { shutdown(); if (exitOnClose) process.exit(0); });
  process.on('SIGINT', () => { shutdown(); process.exit(0); });
  process.on('SIGTERM', () => { shutdown(); process.exit(0); });

  logErr(`ready — ${TOOL_DESCRIPTORS.length} governed tools, caller=${caller}`);
  return { ctx, tools, handle };
}

// Run directly (node mcp/server.js) but stay importable (cli/rory.js, tests).
function invokedDirectly() {
  try { return process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
}
if (invokedDirectly()) startMcpServer();

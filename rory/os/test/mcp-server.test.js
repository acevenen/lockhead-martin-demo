import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_DESCRIPTORS } from '../mcp/descriptors.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(HERE, '..', 'mcp', 'server.js');

// A tiny in-test MCP client: spawns the real server subprocess and speaks
// newline-delimited JSON-RPC over its stdio, exactly as Claude Code/Codex would.
function client() {
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', SERVER], {
    env: { ...process.env, RORY_DB_PATH: ':memory:', RORY_MCP_CALLER: 'owner' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = '';
  const waiters = new Map();
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id != null && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); }
    }
  });
  let seq = 0;
  const req = (method, params) => new Promise((res) => {
    const id = ++seq; waiters.set(id, res);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  const close = () => new Promise((res) => { child.on('exit', (code) => res(code)); child.stdin.end(); });
  return { req, notify, close };
}

test('MCP stdio server: initialize handshake', async () => {
  const c = client();
  const init = await c.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'rory-brain');
  assert.ok(init.result.capabilities.tools, 'advertises the tools capability');
  assert.equal(init.result.protocolVersion, '2024-11-05');
  c.notify('notifications/initialized');
  assert.equal(await c.close(), 0);
});

test('tools/list exposes every governed descriptor with schema + read/write hint', async () => {
  const c = client();
  await c.req('initialize', { protocolVersion: '2024-11-05', capabilities: {} });
  const list = await c.req('tools/list', {});
  const names = list.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, TOOL_DESCRIPTORS.map((d) => d.name).sort(), 'all 20 descriptors exposed');
  assert.ok(list.result.tools.every((t) => t.inputSchema && t.inputSchema.type === 'object'));
  assert.equal(list.result.tools.find((t) => t.name === 'system_status').annotations.readOnlyHint, true);
  assert.equal(list.result.tools.find((t) => t.name === 'task_create').annotations.readOnlyHint, false);
  assert.equal(await c.close(), 0);
});

test('tools/call runs through the boundary (read + write)', async () => {
  const c = client();
  await c.req('initialize', { protocolVersion: '2024-11-05', capabilities: {} });

  const st = await c.req('tools/call', { name: 'system_status', arguments: {} });
  assert.equal(st.result.isError, false);
  const status = JSON.parse(st.result.content[0].text);
  assert.ok(status.agents >= 8, 'agent company loaded through the server');

  const created = await c.req('tools/call', { name: 'task_create', arguments: { objective: 'via mcp stdio', risk: 'low' } });
  assert.equal(created.result.isError, false);
  const task = JSON.parse(created.result.content[0].text);
  assert.ok(task.id.startsWith('task_'));

  // Round-trip read the task we just created.
  const got = await c.req('tools/call', { name: 'task_get', arguments: { id: task.id } });
  assert.equal(JSON.parse(got.result.content[0].text).objective, 'via mcp stdio');

  assert.equal(await c.close(), 0);
});

test('protocol + tool errors are surfaced correctly', async () => {
  const c = client();
  await c.req('initialize', { protocolVersion: '2024-11-05', capabilities: {} });

  // Unknown tool → JSON-RPC invalid-params error.
  const badTool = await c.req('tools/call', { name: 'no_such_tool', arguments: {} });
  assert.equal(badTool.error?.code, -32602);

  // Unknown method → method-not-found.
  const badMethod = await c.req('does/not/exist', {});
  assert.equal(badMethod.error?.code, -32601);

  // ping is answered.
  const pong = await c.req('ping', {});
  assert.deepEqual(pong.result, {});

  assert.equal(await c.close(), 0);
});

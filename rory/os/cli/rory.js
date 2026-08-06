#!/usr/bin/env node
import { writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext } from '../core/context.js';
import { loadAgents } from '../agents/loader.js';
import { runHologramScenario } from '../orchestrator/scenario.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const BRAIN_BOARD = resolve(HERE, '..', '..', 'brain', 'board');
const DATA_BOARD = resolve(HERE, '..', '..', 'data', 'board');

const args = process.argv.slice(2);
const cmd = args[0] ?? 'help';
const flags = new Set(args.filter((a) => a.startsWith('--')));
const out = (o) => process.stdout.write(typeof o === 'string' ? o + '\n' : JSON.stringify(o, null, 2) + '\n');

async function main() {
  switch (cmd) {
    case 'init': return cmdInit();
    case 'status': return cmdStatus();
    case 'board': return cmdBoard();
    case 'demo:e2e': return cmdDemo();
    case 'mcp': return cmdMcp();
    case 'agents': return cmdAgents();
    case 'tasks': return cmdTasks();
    case 'approvals': return cmdApprovals();
    default: return cmdHelp();
  }
}

function cmdHelp() {
  out(`rory-os — local-first control plane

  init          initialize the operational store and load agent manifests
  status        one-glance system status
  board         generate today's board meeting (--regenerate to overwrite)
  demo:e2e      run the mocked end-to-end hologram workflow (in-memory, safe)
  mcp           serve the governed brain over stdio (MCP, JSON-RPC 2.0; zero-dep)
  agents        list the registered agent company
  tasks         list tasks
  approvals     list memory proposals awaiting your decision

Env: RORY_DB_PATH overrides the database location.`);
}

function withCtx(fn, opts = {}) {
  const path = process.env.RORY_DB_PATH;
  const ctx = createContext({ path, ...opts });
  try { return fn(ctx); } finally { ctx.close(); }
}

function cmdInit() {
  withCtx((ctx) => {
    const n = loadAgents(ctx);
    out(`Initialized. Loaded ${n} agent manifest(s). DB ready.`);
    out('Next: `node cli/rory.js demo:e2e` for a full dry run, or `status`.');
  });
}

function cmdStatus() {
  withCtx((ctx) => {
    const open = ctx.tasks.list({}).filter((t) => !['completed', 'cancelled'].includes(t.status));
    const status = {
      agents: ctx.agents.list({}).length,
      goals_file: existsSync(resolve(HERE, '..', '..', 'brain', 'goals', 'active-goals.md')),
      open_tasks: open.length,
      running: open.filter((t) => t.status === 'running').length,
      blocked: open.filter((t) => t.status === 'blocked').length,
      pending_reviews: open.filter((t) => t.status === 'review_requested').length,
      approvals_pending: ctx.memory.pendingProposals().length,
      recent_failures: ctx.failures.list({}).length,
      events_logged: ctx.events.count(),
      last_board: lastBoard(),
    };
    out(status);
  });
}

function cmdBoard() {
  withCtx((ctx) => {
    loadAgents(ctx);
    const { date, json, markdown } = ctx.board.generate();
    mkdirSync(BRAIN_BOARD, { recursive: true });
    mkdirSync(DATA_BOARD, { recursive: true });
    const md = resolve(BRAIN_BOARD, `${date}.md`);
    const js = resolve(DATA_BOARD, `${date}.json`);
    if (existsSync(md) && !flags.has('--regenerate')) {
      out(`Board for ${date} already exists. Use --regenerate to overwrite.`);
      return;
    }
    writeFileSync(md, markdown);
    writeFileSync(js, JSON.stringify(json, null, 2));
    out(`Wrote ${md}`);
    out(`Wrote ${js}`);
  });
}

async function cmdDemo() {
  // Runs entirely in-memory with the mock provider — safe, no files, no network.
  const ctx = createContext({ path: ':memory:', useMock: true });
  try {
    const r = await runHologramScenario(ctx);
    out('=== mocked end-to-end hologram workflow ===');
    out(r.summary);
    out('');
    out(r.board.markdown);
  } finally {
    ctx.close();
  }
}

async function cmdMcp() {
  // Serve the governed tool boundary over stdio. The server owns the process
  // lifecycle (exits when stdin closes), so hold main() open until then.
  const { startMcpServer } = await import('../mcp/server.js');
  startMcpServer();
  return new Promise(() => {});
}

function cmdAgents() {
  withCtx((ctx) => {
    loadAgents(ctx);
    out(ctx.agents.list({}).map((a) => ({ id: a.id, role: a.role, dept: a.department, status: a.status, risk_ceiling: a.risk_ceiling })));
  });
}

function cmdTasks() {
  withCtx((ctx) => out(ctx.tasks.list({}).map((t) => ({ id: t.id, status: t.status, risk: t.risk, objective: t.objective }))));
}

function cmdApprovals() {
  withCtx((ctx) => out(ctx.memory.pendingProposals().map((p) => ({ id: p.id, type: p.memory.type, subject: p.memory.subject, status: p.status }))));
}

function lastBoard() {
  if (!existsSync(BRAIN_BOARD)) return null;
  const files = readdirSync(BRAIN_BOARD).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
  return files.length ? files[files.length - 1].replace('.md', '') : null;
}

main().catch((e) => { process.stderr.write(String(e.stack || e) + '\n'); process.exit(1); });

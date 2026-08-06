import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testContext } from './helpers.js';
import { makeTools } from '../mcp/tools.js';
import { TOOL_DESCRIPTORS } from '../mcp/descriptors.js';

test('governed tools create and read through the boundary', async () => {
  const ctx = testContext({ withAgents: true });
  const owner = makeTools(ctx, { caller: 'owner' });
  const { id } = await owner.task_create({ objective: 'via mcp', risk: 'low' });
  assert.ok(id.startsWith('task_'));
  const t = await owner.task_get({ id });
  assert.equal(t.objective, 'via mcp');
  const status = await owner.system_status();
  assert.ok(status.agents >= 8);
});

test('memory reads are scope-filtered per caller', async () => {
  const ctx = testContext({ withAgents: true });
  const owner = makeTools(ctx, { caller: 'owner' });
  // Owner proposes a project-scoped memory and approves it.
  await owner.memory_propose({ type: 'fact', scope: 'project:sentinel', subject: 's', content: 'sentinel detail' });

  // eng-demo can read project:demos / project:hologram / global, NOT project:sentinel.
  const demo = makeTools(ctx, { caller: 'eng-demo' });
  const hits = await demo.memory_search({ query: 'sentinel' });
  assert.equal(hits.length, 0, 'eng-demo must not see project:sentinel memory');

  // eng-sentinel can.
  const sent = makeTools(ctx, { caller: 'eng-sentinel' });
  assert.ok((await sent.memory_search({ query: 'sentinel' })).length >= 1);
});

test('every descriptor has a handler', () => {
  const ctx = testContext();
  const tools = makeTools(ctx, { caller: 'owner' });
  for (const d of TOOL_DESCRIPTORS) assert.equal(typeof tools[d.name], 'function', `missing handler: ${d.name}`);
  ctx.close();
});

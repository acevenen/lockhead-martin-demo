import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testContext } from './helpers.js';

test('create writes a task and an event', () => {
  const ctx = testContext();
  const t = ctx.tasks.create({ objective: 'ship demo', risk: 'medium' }, { actor: 'ceo-claude' });
  assert.equal(t.status, 'proposed');
  assert.equal(ctx.tasks.get(t.id).objective, 'ship demo');
  assert.ok(ctx.events.list({}).some((e) => e.type === 'task.created'));
  ctx.close();
});

test('legal transitions are allowed, illegal ones throw', () => {
  const ctx = testContext();
  const t = ctx.tasks.create({ objective: 'x' });
  ctx.tasks.transition(t.id, 'planned');
  ctx.tasks.transition(t.id, 'queued');
  assert.throws(() => ctx.tasks.transition(t.id, 'completed'), /illegal transition/);
  ctx.close();
});

test('delegation depth is capped', () => {
  const ctx = testContext({}, );
  const root = ctx.tasks.create({ objective: 'root' });
  let parent = root;
  for (let i = 0; i < 4; i++) parent = ctx.tasks.delegate(parent.id, { objective: `child ${i}` });
  assert.throws(() => ctx.tasks.delegate(parent.id, { objective: 'too deep' }), /DELEGATION_LIMIT|delegation depth/);
  ctx.close();
});

test('retry limit is enforced on failed -> queued', () => {
  const ctx = testContext();
  const t = ctx.tasks.create({ objective: 'flaky' });
  ctx.tasks.transition(t.id, 'planned');
  ctx.tasks.transition(t.id, 'queued');
  ctx.tasks.transition(t.id, 'assigned', { patch: { assigned_agent: 'a' } });
  const cycleFail = () => {
    ctx.tasks.transition(t.id, 'running');
    ctx.tasks.transition(t.id, 'failed');
    ctx.tasks.transition(t.id, 'queued'); // retry
    ctx.tasks.transition(t.id, 'assigned', { patch: { assigned_agent: 'a' } });
  };
  cycleFail(); // retry 1
  cycleFail(); // retry 2
  ctx.tasks.transition(t.id, 'running');
  ctx.tasks.transition(t.id, 'failed');
  assert.throws(() => ctx.tasks.transition(t.id, 'queued'), /RETRY_LIMIT|retry limit/);
  ctx.close();
});

test('evidence is appended and persisted', () => {
  const ctx = testContext();
  const t = ctx.tasks.create({ objective: 'x' });
  ctx.tasks.addEvidence(t.id, { note: 'built it' });
  assert.equal(ctx.tasks.get(t.id).evidence.length, 1);
  ctx.close();
});

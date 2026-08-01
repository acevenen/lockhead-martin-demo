import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testContext } from './helpers.js';

test('a valid handoff is stored and retrievable', () => {
  const ctx = testContext();
  const ho = ctx.handoffs.create({
    task_id: 't1', from_agent: 'eng-demo', to_agent: 'qa-reviewer',
    objective: 'review the landmarks spike', summary: 'draft ready',
    changes: [{ artifact: 'hologram/spikes/landmarks.html', description: 'initial spike' }],
    decisions: [{ decision: 'use MediaPipe Hands', reason: 'best supported browser hand tracker' }],
    verification: { commands_or_checks: ['open in browser'], result: 'partial' },
    recommended_next_action: 'map fingertip to cursor',
  });
  assert.equal(ctx.handoffs.get(ho.handoff_id).to_agent, 'qa-reviewer');
  assert.equal(ctx.handoffs.forTask('t1').length, 1);
  ctx.close();
});

test('an incomplete handoff is rejected by the contract', () => {
  const ctx = testContext();
  assert.throws(() => ctx.handoffs.create({ task_id: 't1', from_agent: 'a' }), /handoff failed validation/);
  ctx.close();
});

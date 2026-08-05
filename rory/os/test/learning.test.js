import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testContext } from './helpers.js';

test('a lesson cannot be verified without evidence', () => {
  const ctx = testContext();
  const l = ctx.lessons.propose({ trigger_conditions: 'x', prevention_instruction: 'do y' });
  assert.equal(l.status, 'proposed');
  assert.throws(() => ctx.lessons.verify(l.id, {}), /UNVERIFIED|without a passing check/);
  ctx.close();
});

test('a passing check activates a lesson', () => {
  const ctx = testContext();
  const l = ctx.lessons.propose({ trigger_conditions: 'gesture edge', prevention_instruction: 'debounce', task_type: 'frontend', tags: ['gesture'] });
  const v = ctx.lessons.verify(l.id, { verifier: 'qa-reviewer', checkPassed: true, evidence: [{ check: 't', result: 'passed' }] });
  assert.equal(v.status, 'active');
  assert.equal(v.confidence, 'stated');
  assert.ok(v.last_verified);
  ctx.close();
});

test('relevant() returns active lessons by task type / tags', () => {
  const ctx = testContext();
  const l = ctx.lessons.propose({ trigger_conditions: 'x', prevention_instruction: 'y', task_type: 'frontend' });
  ctx.lessons.verify(l.id, { checkPassed: true });
  assert.equal(ctx.lessons.relevant({ taskType: 'frontend' }).length, 1);
  assert.equal(ctx.lessons.relevant({ taskType: 'backend' }).length, 0);
  ctx.close();
});

test('failure records and links to a lesson', () => {
  const ctx = testContext();
  const f = ctx.failures.record({ symptom: 'thing broke', task_id: 't1' });
  const l = ctx.lessons.propose({ trigger_conditions: 'x', prevention_instruction: 'y' });
  ctx.failures.linkLesson(f.id, l.id);
  assert.equal(ctx.failures.list({})[0].lesson_id, l.id);
  ctx.close();
});

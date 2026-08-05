import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testContext } from './helpers.js';

test('high-risk output cannot be self-approved', () => {
  const ctx = testContext();
  assert.throws(() => ctx.reviews.submit(
    { task_id: 't1', worker_agent: 'eng-demo', reviewer_agent: 'eng-demo', decision: 'approved' },
    { taskRisk: 'high' },
  ), /SELF_APPROVAL|self-approved/);
  ctx.close();
});

test('an independent reviewer may approve high-risk work', () => {
  const ctx = testContext();
  const art = ctx.artifacts.register({ task_id: 't1', type: 'code', authoring_agent: 'eng-demo' });
  const review = ctx.reviews.submit(
    { task_id: 't1', worker_agent: 'eng-demo', reviewer_agent: 'qa-reviewer', decision: 'approved', artifact_ids: [art.id] },
    { taskRisk: 'high' },
  );
  assert.equal(review.decision, 'approved');
  assert.equal(ctx.artifacts.get(art.id).review_state, 'approved');
  ctx.close();
});

test('low-risk self-review is permitted', () => {
  const ctx = testContext();
  const review = ctx.reviews.submit(
    { task_id: 't1', worker_agent: 'ops-brief', reviewer_agent: 'ops-brief', decision: 'approved' },
    { taskRisk: 'low' },
  );
  assert.equal(review.decision, 'approved');
  ctx.close();
});

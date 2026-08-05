import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testContext } from './helpers.js';
import { localDateLabel } from '../board/meeting.js';

test('board window excludes events outside the preceding 24h', () => {
  // Clock at a fixed instant; create one in-window and confirm out-of-window is excluded.
  const ctx = testContext({ start: '2026-08-01T10:00:00.000Z', stepMs: 0 });
  ctx.events.append('task.created', 'ceo-claude', { payload: { note: 'in window' } });
  const { json } = ctx.board.generate({ now: '2026-08-01T12:00:00.000Z' });
  assert.ok(json.activity.events >= 1);
  // A window far in the future sees nothing.
  const later = ctx.board.generate({ now: '2027-01-01T00:00:00.000Z' });
  assert.equal(later.json.no_activity, true);
  ctx.close();
});

test('action plan ranks and caps at three top actions', () => {
  const ctx = testContext({ withAgents: true, start: '2026-08-01T10:00:00.000Z', stepMs: 100 });
  for (let i = 0; i < 5; i++) {
    const t = ctx.tasks.create({ objective: `task ${i}`, priority: 50 + i * 10, risk: 'low' });
    ctx.tasks.transition(t.id, 'planned');
    ctx.tasks.transition(t.id, 'queued');
  }
  const { json } = ctx.board.generate({ now: '2026-08-01T12:00:00.000Z' });
  assert.ok(json.action_plan.length >= 5);
  assert.ok(json.top_actions.length <= 3);
  // Sorted descending by score.
  const scores = json.action_plan.map((a) => a.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  ctx.close();
});

test('localDateLabel renders the meeting date in the configured tz', () => {
  // 2026-08-01T06:00Z is 2026-07-31 23:00 in America/Los_Angeles.
  assert.equal(localDateLabel('2026-08-01T06:00:00.000Z'), '2026-07-31');
});

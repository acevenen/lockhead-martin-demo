import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, validateNamed, assertNamed } from '../contracts/index.js';
import { taskSchema } from '../contracts/schemas.js';

test('valid task passes the task contract', () => {
  const task = {
    id: 'task_1', objective: 'do a thing', status: 'proposed', risk: 'low',
    created_at: '2026-08-01T00:00:00.000Z',
  };
  assert.equal(validateNamed('task', task).valid, true);
});

test('unknown enum value is rejected', () => {
  const r = validateNamed('task', {
    id: 'task_1', objective: 'x', status: 'nonsense', risk: 'low', created_at: '2026-08-01T00:00:00.000Z',
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('status')));
});

test('missing required property is reported with a path', () => {
  const r = validate(taskSchema, { id: 'task_1', risk: 'low', status: 'proposed', created_at: '2026-08-01T00:00:00.000Z' });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('objective')));
});

test('additionalProperties:false rejects unexpected keys', () => {
  const r = validate(taskSchema, {
    id: 'task_1', objective: 'x', status: 'proposed', risk: 'low', created_at: '2026-08-01T00:00:00.000Z', bogus: 1,
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('bogus')));
});

test('date-time format is enforced', () => {
  const r = validate(taskSchema, { id: 'task_1', objective: 'x', status: 'proposed', risk: 'low', created_at: 'yesterday' });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('date-time')));
});

test('nested array-of-objects is validated (handoff changes)', () => {
  assert.throws(() => assertNamed('handoff', {
    handoff_id: 'ho_1', task_id: 't', from_agent: 'a', to_agent: 'b', objective: 'o',
    status: 'ready', summary: 's', created_at: '2026-08-01T00:00:00.000Z',
    changes: [{ artifact: 'x' }], // missing "description"
  }), /description/);
});

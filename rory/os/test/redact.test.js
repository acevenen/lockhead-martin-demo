import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact, looksLikeSecret } from '../lib/redact.js';

test('redacts secret-like keys', () => {
  const out = redact({ user: 'ace', api_key: 'sk-abc123', nested: { password: 'hunter2' } });
  assert.equal(out.user, 'ace');
  assert.equal(out.api_key, '[REDACTED]');
  assert.equal(out.nested.password, '[REDACTED]');
});

test('redacts secret-shaped values even under innocent keys', () => {
  const out = redact({ note: 'token is sk-ant-abcdefghijklmnop12345' });
  assert.equal(out.note, '[REDACTED]');
});

test('looksLikeSecret detects keys and value shapes', () => {
  assert.equal(looksLikeSecret('authorization', 'Bearer x'), true);
  assert.equal(looksLikeSecret('subject', 'ghp_0123456789abcdefghij0'), true);
  assert.equal(looksLikeSecret('city', 'Los Angeles'), false);
});

test('redact handles arrays and cycles', () => {
  const a = { list: [{ secret: 'x' }, { ok: 1 }] };
  a.self = a;
  const out = redact(a);
  assert.equal(out.list[0].secret, '[REDACTED]');
  assert.equal(out.list[1].ok, 1);
  assert.equal(out.self, '[Circular]');
});

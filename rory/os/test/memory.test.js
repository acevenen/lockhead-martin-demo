import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testContext } from './helpers.js';

test('a plain fact auto-accepts to active', () => {
  const ctx = testContext();
  const { auto, memory } = ctx.memory.propose({ type: 'fact', subject: 'stack', content: 'Node 22 + SQLite' }, { proposer: 'cto-codex' });
  assert.equal(auto, true);
  assert.equal(ctx.memory.get(memory.id).status, 'active');
  ctx.close();
});

test('preferences, goals, identity, and restricted require approval', () => {
  const ctx = testContext();
  for (const draft of [
    { type: 'preference', subject: 'tabs', content: 'spaces not tabs' },
    { type: 'goal', subject: 'north star', content: 'become Tony Stark' },
    { type: 'fact', scope: 'identity', subject: 'name', content: 'unknown' },
    { type: 'fact', sensitivity: 'restricted', subject: 'thing', content: 'sensitive' },
  ]) {
    const { auto, proposal } = ctx.memory.propose(draft);
    assert.equal(auto, false, `${draft.type}/${draft.scope}/${draft.sensitivity} should need approval`);
    assert.equal(proposal.status, 'needs_approval');
  }
  assert.equal(ctx.memory.pendingProposals().length, 4);
  ctx.close();
});

test('owner approval activates a proposal', () => {
  const ctx = testContext();
  const { proposal } = ctx.memory.propose({ type: 'goal', subject: 'ns', content: 'ship the hologram' });
  const mem = ctx.memory.accept(proposal.id, { approver: 'owner' });
  assert.equal(mem.status, 'active');
  assert.equal(mem.approved_by, 'owner');
  ctx.close();
});

test('refuses to store secrets', () => {
  const ctx = testContext();
  assert.throws(() => ctx.memory.propose({ type: 'fact', subject: 'key', content: 'sk-ant-abcdefghijklmnop123456' }), /SECRET_REFUSED|secret/);
  ctx.close();
});

test('a conflicting active memory becomes disputed, not overwritten', () => {
  const ctx = testContext();
  ctx.memory.propose({ type: 'fact', subject: 'editor', content: 'vim' });
  const second = ctx.memory.propose({ type: 'fact', subject: 'editor', content: 'vscode' });
  assert.equal(second.memory.status, 'disputed');
  // both still exist
  assert.equal(ctx.memory.list({ status: 'active' }).filter((m) => m.subject === 'editor').length, 1);
  assert.equal(ctx.memory.list({ status: 'disputed' }).length, 1);
  ctx.close();
});

test('supersession retires the old memory', () => {
  const ctx = testContext();
  const first = ctx.memory.propose({ type: 'fact', subject: 'city', content: 'unknown' });
  const second = ctx.memory.propose({ type: 'fact', subject: 'city', content: 'Los Angeles', supersedes: first.memory.id });
  assert.equal(second.memory.status, 'active');
  assert.equal(ctx.memory.get(first.memory.id).status, 'superseded');
  ctx.close();
});

test('full-text search finds active memory', () => {
  const ctx = testContext();
  ctx.memory.propose({ type: 'fact', subject: 'runtime', content: 'the control plane runs on Node with SQLite' });
  const hits = ctx.memory.search('SQLite');
  assert.ok(hits.length >= 1);
  ctx.close();
});

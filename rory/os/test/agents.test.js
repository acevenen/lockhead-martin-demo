import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testContext } from './helpers.js';
import { readManifests } from '../agents/loader.js';

test('all brain manifests validate and register', () => {
  const ctx = testContext({ withAgents: true });
  const manifests = readManifests();
  assert.ok(manifests.length >= 8, 'expected the full company roster');
  assert.equal(ctx.agents.list({}).length, manifests.length);
  // CEO is executive; Hermes is discovery_required.
  assert.equal(ctx.agents.get('ceo-claude').department, 'Executive');
  assert.equal(ctx.agents.get('hermes').status, 'discovery_required');
  ctx.close();
});

test('candidatesFor ranks by task type and capability', () => {
  const ctx = testContext({ withAgents: true });
  const cands = ctx.agents.candidatesFor({ taskType: 'frontend', capabilities: ['3d'] });
  assert.equal(cands[0].id, 'eng-demo');
  // Hermes (discovery_required) never appears as an active candidate.
  assert.ok(!cands.some((c) => c.id === 'hermes'));
  ctx.close();
});

test('an invalid manifest is rejected', () => {
  const ctx = testContext();
  assert.throws(() => ctx.agents.register({ id: 'bad', name: 'Bad' }), /agent-manifest failed validation/);
  ctx.close();
});

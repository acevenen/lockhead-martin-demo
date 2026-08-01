import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// Canonical, human-readable agent manifests live in the brain.
export const REGISTRY_DIR = resolve(HERE, '..', '..', 'brain', 'agents', 'registry');

/** Read all agent manifests (JSON) from a directory. */
export function readManifests(dir = REGISTRY_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

/** Register every manifest in the brain into the operational registry.
 *  Idempotent (INSERT OR REPLACE). Returns the count. */
export function loadAgents(ctx, dir = REGISTRY_DIR) {
  const manifests = readManifests(dir);
  for (const m of manifests) ctx.agents.register(m, { actor: 'system:loader' });
  return manifests.length;
}

/** Ensure the registry has agents; load from the brain if empty. */
export function ensureAgents(ctx, dir = REGISTRY_DIR) {
  if (ctx.agents.list({}).length === 0) return loadAgents(ctx, dir);
  return ctx.agents.list({}).length;
}

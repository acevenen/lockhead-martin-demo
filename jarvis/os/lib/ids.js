import { randomUUID } from 'node:crypto';

/**
 * Stable, prefixed unique id. The prefix names the entity type so ids are
 * self-describing in logs and events (e.g. "task_ab12…", "mem_cd34…").
 */
export function id(prefix) {
  return `${prefix}_${randomUUID()}`;
}

/** Short, human-scannable id fragment for display only (never a key). */
export function shortId(fullId) {
  const uuid = String(fullId).split('_').pop() || '';
  return uuid.slice(0, 8);
}

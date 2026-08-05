import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(HERE, 'schema.sql');

// Default DB location. `:memory:` is used by tests. Real runs use
// rory/data/rory.db (gitignored).
export const DEFAULT_DB_PATH = resolve(HERE, '..', '..', 'data', 'rory.db');

/**
 * Open (and migrate) the operational store. Pass ':memory:' for an ephemeral
 * database. Returns a thin wrapper with query helpers; the raw node:sqlite
 * handle is on `.raw`.
 */
export function openDb(path = DEFAULT_DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return wrap(db);
}

/** Apply the schema. Idempotent — safe to call on every open. */
export function migrate(rawDb) {
  rawDb.exec(readFileSync(SCHEMA_PATH, 'utf8'));
}

function wrap(db) {
  return {
    raw: db,
    /** Execute a write; returns { changes, lastInsertRowid }. */
    run(sql, params = []) {
      return db.prepare(sql).run(...params);
    },
    /** Fetch one row (or undefined). */
    get(sql, params = []) {
      return db.prepare(sql).get(...params);
    },
    /** Fetch all rows. */
    all(sql, params = []) {
      return db.prepare(sql).all(...params);
    },
    /** Run fn inside a transaction; rolls back on throw. */
    tx(fn) {
      db.exec('BEGIN');
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    close() {
      db.close();
    },
  };
}

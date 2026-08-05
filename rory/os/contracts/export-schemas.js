#!/usr/bin/env node
// Exports the in-code contracts (schemas.js) to standalone JSON-Schema files in
// contracts/schemas/ for external consumers (the MCP boundary, other agents,
// tooling). The in-code objects remain the source of truth; these files are
// generated. A drift-guard test (test/contracts-export.test.js) fails if the
// committed files fall out of sync, so regenerate after changing a schema:
//     node contracts/export-schemas.js
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMAS } from './schemas.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_DIR = resolve(HERE, 'schemas');
const DRAFT = 'http://json-schema.org/draft-07/schema#';

/** A schema with the draft header, ready to serialize as a standalone file. */
export function withHeader(schema) {
  return { $schema: DRAFT, ...schema };
}

/** The full set of exportable files as { filename: contentString }. */
export function schemaFiles() {
  const out = {};
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    out[`${name}.schema.json`] = JSON.stringify(withHeader(schema), null, 2) + '\n';
  }
  return out;
}

/** Write every schema file to `dir`. Returns the filenames written. */
export function writeAll(dir = SCHEMA_DIR) {
  mkdirSync(dir, { recursive: true });
  const files = schemaFiles();
  for (const [file, content] of Object.entries(files)) writeFileSync(resolve(dir, file), content);
  return Object.keys(files);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const written = writeAll();
  process.stdout.write(`Exported ${written.length} schema(s) to ${SCHEMA_DIR}\n`);
}

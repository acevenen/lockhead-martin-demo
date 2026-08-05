import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCHEMAS } from '../contracts/schemas.js';
import { schemaFiles, withHeader, SCHEMA_DIR } from '../contracts/export-schemas.js';

// Drift guard: the committed contracts/schemas/*.json must match the in-code
// schemas. If this fails, run `node contracts/export-schemas.js` and commit.
test('exported schema files are in sync with the in-code contracts', () => {
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    const file = resolve(SCHEMA_DIR, `${name}.schema.json`);
    let onDisk;
    try {
      onDisk = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      assert.fail(`missing exported schema: ${name}.schema.json — run: node contracts/export-schemas.js`);
    }
    assert.deepEqual(onDisk, withHeader(schema), `${name}.schema.json is out of date — run: node contracts/export-schemas.js`);
  }
});

test('schemaFiles() produces one file per contract with a draft header', () => {
  const files = schemaFiles();
  assert.equal(Object.keys(files).length, Object.keys(SCHEMAS).length);
  for (const content of Object.values(files)) {
    assert.ok(JSON.parse(content).$schema.includes('json-schema.org'));
  }
});

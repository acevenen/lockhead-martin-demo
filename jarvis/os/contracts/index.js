// Public entry point for the contracts layer.
export { validate, assertValid } from './validator.js';
export { SCHEMAS } from './schemas.js';
export * as enums from './enums.js';

import { SCHEMAS } from './schemas.js';
import { validate, assertValid } from './validator.js';

/** Validate a value against a named contract, e.g. validateNamed('task', t). */
export function validateNamed(name, data) {
  const schema = SCHEMAS[name];
  if (!schema) throw new Error(`unknown contract: ${name}`);
  return validate(schema, data);
}

export function assertNamed(name, data) {
  const schema = SCHEMAS[name];
  if (!schema) throw new Error(`unknown contract: ${name}`);
  return assertValid(schema, data, name);
}

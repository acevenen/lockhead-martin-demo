// A small, dependency-free JSON-Schema validator covering the draft-07 keyword
// subset the Rory contracts actually use. It is intentionally NOT a full
// validator — ajv is the documented upgrade path (ADR-0003) — but it is real:
// it walks nested objects/arrays and reports precise paths.
//
// Supported keywords: type, enum, const, required, properties,
// additionalProperties (boolean), items, minItems, minLength, maxLength,
// minimum, maximum, pattern, format ("date-time"), nullable (via type arrays).

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v; // string | number | boolean | object | undefined
}

function matchesType(value, type) {
  const t = typeOf(value);
  if (type === 'number') return t === 'number' || t === 'integer';
  if (type === 'integer') return t === 'integer';
  return t === type;
}

function checkType(value, schema, path, errors) {
  if (schema.type === undefined) return true;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!types.some((t) => matchesType(value, t))) {
    errors.push(`${path}: expected type ${types.join('|')}, got ${typeOf(value)}`);
    return false;
  }
  return true;
}

function validateNode(value, schema, path, errors) {
  if (schema === true) return;
  if (schema === false) {
    errors.push(`${path}: value not allowed`);
    return;
  }

  // const / enum
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push(`${path}: must be one of ${schema.enum.join(', ')}`);
  }

  if (!checkType(value, schema, path, errors)) return;

  const t = typeOf(value);

  if (t === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: does not match pattern ${schema.pattern}`);
    }
    if (schema.format === 'date-time' && !ISO_DATETIME.test(value)) {
      errors.push(`${path}: not an ISO-8601 date-time`);
    }
  }

  if (t === 'number' || t === 'integer') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: below minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: above maximum ${schema.maximum}`);
    }
  }

  if (t === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: fewer than minItems ${schema.minItems}`);
    }
    if (schema.items) {
      value.forEach((item, i) => validateNode(item, schema.items, `${path}[${i}]`, errors));
    }
  }

  if (t === 'object') {
    const props = schema.properties || {};
    for (const req of schema.required || []) {
      if (!(req in value)) errors.push(`${path}: missing required property "${req}"`);
    }
    for (const [key, val] of Object.entries(value)) {
      if (props[key]) {
        validateNode(val, props[key], `${path}.${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}: unexpected property "${key}"`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        validateNode(val, schema.additionalProperties, `${path}.${key}`, errors);
      }
    }
  }
}

/** Validate `data` against `schema`. Returns { valid, errors[] }. */
export function validate(schema, data) {
  const errors = [];
  validateNode(data, schema, '$', errors);
  return { valid: errors.length === 0, errors };
}

/** Throwing variant — use at trust boundaries. */
export function assertValid(schema, data, label = 'value') {
  const { valid, errors } = validate(schema, data);
  if (!valid) {
    const err = new Error(`${label} failed validation:\n  - ${errors.join('\n  - ')}`);
    err.code = 'SCHEMA_VALIDATION';
    err.errors = errors;
    throw err;
  }
  return data;
}

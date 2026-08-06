// Secret redaction. Two jobs:
//  1. Keep secret-like values out of logs and events (redact()).
//  2. Let the memory layer refuse to store credentials (looksLikeSecret()).
//
// This is defense-in-depth, not a substitute for never collecting secrets in
// the first place — see brain/constitution/memory-policy.md.

const SECRET_KEY = /(pass(word|phrase)?|secret|token|api[_-]?key|apikey|authorization|auth[_-]?token|cookie|private[_-]?key|access[_-]?key|client[_-]?secret|recovery[_-]?code|session)/i;

// Value shapes that are almost certainly credentials regardless of key name.
const SECRET_VALUE = [
  /\bsk-[A-Za-z0-9]{16,}\b/, // OpenAI-style
  /\bsk-ant-[A-Za-z0-9_-]{16,}\b/, // Anthropic-style
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{20,}\b/, // GitHub token
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, // JWT
];

export function looksLikeSecret(key, value) {
  if (typeof key === 'string' && SECRET_KEY.test(key)) return true;
  if (typeof value === 'string' && SECRET_VALUE.some((re) => re.test(value))) return true;
  return false;
}

const MASK = '[REDACTED]';

/** Deep-clone with secret-like keys/values masked. Safe for logs and events. */
export function redact(input, seen = new WeakSet()) {
  if (input === null || typeof input !== 'object') {
    return typeof input === 'string' && SECRET_VALUE.some((re) => re.test(input)) ? MASK : input;
  }
  if (seen.has(input)) return '[Circular]';
  seen.add(input);
  if (Array.isArray(input)) return input.map((v) => redact(v, seen));
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof k === 'string' && SECRET_KEY.test(k)) out[k] = MASK;
    else out[k] = redact(v, seen);
  }
  return out;
}

import { redact } from './redact.js';

// Structured JSON logging with automatic secret redaction. Writes to stderr so
// stdout stays clean for CLI data output. Never logs raw secret-like fields.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold = LEVELS[process.env.JARVIS_LOG_LEVEL] ?? LEVELS.info;

export function setLogLevel(level) {
  threshold = LEVELS[level] ?? threshold;
}

export function createLogger(name) {
  const emit = (level, msg, fields) => {
    if (LEVELS[level] < threshold) return;
    const line = {
      ts: new Date().toISOString(),
      level,
      logger: name,
      msg,
      ...(fields ? redact(fields) : {}),
    };
    process.stderr.write(JSON.stringify(line) + '\n');
  };
  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
  };
}

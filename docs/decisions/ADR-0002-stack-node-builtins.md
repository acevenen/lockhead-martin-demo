# ADR-0002: Plain ESM JavaScript on Node 22 built-ins, zero external dependencies

## Status

Accepted

## Context

The bootstrap directive's default stack was TypeScript + ajv + Vitest. Jarvis is
local-first: it must run robustly on the owner's machine with minimal moving
parts, ideally with no network at test time and no native toolchain to break
across machines. Node 22 ships the pieces we need in the standard library —
`node:sqlite` (embedded SQLite), `node:test` (a test runner), `node:crypto`
(hashing), and `--experimental-strip-types`.

## Decision

Build the control plane as plain ESM JavaScript on Node 22 built-ins only:
`node:sqlite` for storage, `node:test` for tests, `node:crypto` for hashing.
Zero external npm dependencies. No build step — source runs as written. Tests run
with no API keys and no network, because `MockProvider` is the default (see
ADR-0004). The 45 `node:test` tests pass on a clean checkout with `node --test`.

## Consequences

No dependency tree to audit, no supply-chain surface, no native builds, no
lockfile drift. A new contributor runs the suite immediately. The cost: we forgo
TypeScript's compile-time checks and a mature validation/test ecosystem, and we
hand-rolled a small JSON-Schema validator (ADR-0003). Documented upgrade path,
consistent with local-first: TypeScript via `--experimental-strip-types` (no
bundler), ajv in place of the in-repo validator, and Vitest in place of
`node:test` — each a drop-in behind existing module boundaries.

## Alternatives considered

- **TypeScript + ajv + Vitest now** — rejected for this phase: adds a build step, a dependency tree, and a compile/native surface that fights the local-first, air-gap-friendly goal. Kept as the upgrade path.
- **Deno / Bun** — rejected: another runtime to standardize on when Node 22 already covers the needs.

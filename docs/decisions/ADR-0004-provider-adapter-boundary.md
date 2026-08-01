# ADR-0004: Provider adapter boundary; mock default; optional embeddings

## Status

Accepted

## Context

The control plane must not be coupled to any LLM vendor, and it must run and be
tested without credentials or a network connection. Separately, semantic search
is useful but should not be a hard dependency: a fresh install must be able to
search memory on day one, offline.

## Decision

All model calls go through one provider interface. The default is `MockProvider`
— deterministic, offline, used by the test suite. Real adapters (Anthropic,
OpenAI, Ollama) implement the same interface and **fail closed until explicitly
configured** via environment variables; they never borrow Claude Code's
interactive credentials. Semantic embeddings are an **optional, rebuildable
index behind an interface**, not a required store: primary memory search is
SQLite FTS5 full-text, available immediately, and an embedding index can be built
later and rebuilt from canonical memory at any time.

## Consequences

The control plane, its tests, and the whole task/review/board loop run with no
keys and no network. Vendors are swappable without touching business logic.
Nothing breaks if embeddings are absent, misconfigured, or a provider is offline
— search degrades to FTS5, not to failure. The cost: mock outputs are not
"smart," so end-to-end demos exercise plumbing, not model quality.

## Alternatives considered

- **Hardwire one vendor's SDK** — rejected: lock-in, and tests would require live keys and network.
- **Require a vector DB / embeddings for memory** — rejected: adds a dependency and a rebuild-from-scratch failure mode. FTS5 covers the common case and embeddings stay optional and rebuildable behind an interface.

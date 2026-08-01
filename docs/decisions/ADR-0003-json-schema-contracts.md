# ADR-0003: JSON-Schema-authored contracts with a small in-repo validator

## Status

Accepted

## Context

Every seam between modules — tasks, events, memory proposals, handoff envelopes,
review verdicts — needs a stable, validated contract. We want contracts that are
declarative, language-neutral, and portable to another validator or language
later, not validation logic scattered as imperative checks. But ADR-0002 forbids
external dependencies in this phase, which rules out pulling in ajv now.

## Decision

Author contracts as JSON Schema in `contracts/schemas.js`, with shared
enumerations in `contracts/enums.js`. Validate them with a small in-repo
validator (`contracts/validator.js`) that implements exactly the draft-07 subset
the schemas actually use: `type`, `required`, `properties`, `enum`,
`additionalProperties`, arrays/`items`, string/number bounds, and `$ref`. Every
inbound object at a seam is validated before it is trusted.

## Consequences

Contracts are data, not code — readable, diffable, and reusable by any language
or tool. The validator is small enough to audit in one sitting. The risk is that
an unimplemented keyword is silently ignored, so schemas must stay within the
supported subset (this is tested). Upgrade path: drop in ajv (optionally with
ajv-formats) behind the same `validate()` signature when full draft coverage or
format checks are needed — the schemas themselves do not change.

## Alternatives considered

- **Zod (or another code-first schema library)** — rejected: couples contracts to JavaScript, is not directly portable to other languages/tools, and adds a dependency. JSON Schema keeps contracts as language-neutral data.
- **Full ajv now** — rejected only for the zero-dependency phase; it is the documented upgrade behind an unchanged interface.

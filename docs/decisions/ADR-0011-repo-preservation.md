# ADR-0011: Preserving the existing repository while adding the OS

## Status

Accepted

## Context

The Jarvis OS was bootstrapped inside an existing, active repository that already
contained the AEGIS Overwatch demo, the JARVIS command HUD, a knowledge base,
four Claude subagents, `jarvisd`, and CentLabs. None of that could be broken, and
the addition could not become a competing or nested project.

## Decision

Add the OS **alongside** what exists, never in place of it. New code and data live
under `jarvis/brain/` (canonical memory), `jarvis/os/` (control plane), and
`jarvis/data/` (operational DB, gitignored), next to the existing `jarvis/` HUD.
The HUD's `index.html` and `state.json` were left untouched. The four existing
`.claude/agents/*.md` were normalized into new manifests that record a source
hash of each original; the originals were not modified. The root `CLAUDE.md` was
preserved with only an additive pointer to the OS. No nested git repository was
created.

## Consequences

The existing demos and HUD keep working exactly as before; the OS is additive and
reversible. Agent manifests carry provenance (source hashes), so drift from the
originals is detectable. One repo, one history — no submodule or nested-repo
confusion. The cost: the OS must respect existing conventions (single-file,
no-build demos) and coexist with heterogeneous stacks.

## Alternatives considered

- **Rewrite/replace the existing HUD and agents** — rejected: destroys working assets and the owner's trust.
- **A separate or nested repo for the OS** — rejected: splits history and complicates tooling.
- **Overwriting `CLAUDE.md`** — rejected: an additive pointer preserves the existing protocol.

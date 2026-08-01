# Discovery — Integration Risks

Risks identified while planning how the Jarvis OS integrates with the existing
repository, and the mitigation adopted.

| # | Risk | Likelihood | Mitigation adopted |
|---|---|---|---|
| 1 | **Collision with existing `jarvis/`** (the HUD). A "Jarvis" OS could overwrite `state.json` / `index.html`. | High if careless | OS is added under **new** subdirs (`jarvis/brain/`, `jarvis/os/`, `jarvis/data/`). Existing HUD files are never written. |
| 2 | **Overwriting the authoritative `CLAUDE.md`.** | Medium | `CLAUDE.md` is **preserved**; a small, clearly-delimited pointer section is appended (additive, reversible). `AGENTS.md` is new. |
| 3 | **Destructive agent migration.** Normalizing agents could rewrite the originals. | Medium | Originals in `.claude/agents/` are **untouched**; normalization produces new manifests under `jarvis/brain/agents/` with source hashes recorded. |
| 4 | **Heavy dependencies / native builds** (better-sqlite3, ajv, vitest) failing in a restricted env. | Medium | Zero external deps: `node:sqlite`, `node:test`, a small in-repo JSON-Schema validator. |
| 5 | **Secret leakage** into repo/logs. | High impact | `.env.example` holds names only; structured logger redacts secret-like keys; memory policy forbids storing credentials; `data/` DB is gitignored. |
| 6 | **Prompt injection** via imported agent text or future web/doc ingestion. | Medium | Imported agent prompts are stored as **provenance data, never executed as code**. Memory writes are proposal-first and scoped. Threat model documents the rest. |
| 7 | **Cost runaway / recursive delegation.** | Medium | Configurable max delegation depth, retries, per-task timeout/lease, per-run budget; router records every decision. Enforced in the task engine + tests. |
| 8 | **Cross-repo authority** (Sentinel lives in another repo). | Medium | `eng-sentinel` manifest marks the Sentinel repo as a separate authority boundary; no cross-repo writes from the OS. |
| 9 | **`state.json` coupling.** Board meeting could depend on the live HUD state and drift. | Low | Board meeting reads the **append-only event ledger**, not `state.json`. The HUD state stays the HUD's concern; a future adapter can mirror, but isn't coupled now. |
| 10 | **Nested git repo** created by tooling. | Low | Verified none exists; OS uses the repo's existing git. No `git init`. |
| 11 | **Self-approval of high-risk work.** | Medium | Review engine enforces reviewer separation: an agent cannot be the sole approver of its own high-risk output. |
| 12 | **Public exposure of a local service.** | High impact | All network interfaces bind `127.0.0.1`; MCP transport is stdio-first; no public deploy in this phase. |
| 13 | **Stale/inferred facts about the owner presented as truth.** | Medium | Profile files use `unknown`/TODO; inferences are labeled `confidence: inferred`; latest explicit statement supersedes; conflicts become `disputed`, not silently merged. |

## Open integration questions (do not block Phases 0–2)

- Should `daily-brief` be retired in favor of the board meeting, or kept for the
  HUD spoken brief? (Proposed: keep for HUD, board meeting is durable record.)
- Where should the **hologram application code** ultimately live — in this repo,
  or a dedicated repo? (Project-management state lives here now; charter flags
  the decision.)
- Codex/Hermes real capabilities — pending owner-provided inventory.

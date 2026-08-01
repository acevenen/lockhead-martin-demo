# Imported agents — migration matrix

The four repository-local Claude agents were **normalized into manifests**
(`../registry/*.json`) without changing the originals. The originals remain the
runtime definitions in `.claude/agents/` and are the provenance of record.

| Original (`.claude/agents/`) | Source hash | Normalized manifest | New role | Dept | Tool change |
|---|---|---|---|---|---|
| `biz-ops.md` | `45daaab3` | `ops-bizops.json` | ops-bizops | Operations | narrowed "All tools" → task_create, memory_propose, memory_search |
| `daily-brief.md` | `e8445d29` | `ops-brief.json` | ops-brief | Operations | narrowed → board_generate, memory_search, task_list |
| `demo-engineer.md` | `5278bc36` | `eng-demo.json` | eng-demo | Engineering | narrowed → task_update, artifact_register, memory_search |
| `sentinel-lead.md` | `821f106b` | `eng-sentinel.json` | eng-sentinel | Engineering | narrowed; Sentinel repo marked a separate authority boundary |

Plus new/executive roles with no imported original: `ceo-claude` (promoted from
the `CLAUDE.md` chief-of-staff protocol), `cto-codex`, `qa-reviewer`,
`research-reviewer`, and `hermes` (placeholder, `discovery_required`).

## Migration principles applied (directive §15)
1. Originals inventoried, not modified.
2. Source hashes recorded in each manifest's `source_provenance`.
3. Duplicate/overlapping responsibilities identified in
   `docs/discovery/agent-inventory.md` (e.g. `ops-brief` vs. the board meeting) —
   **both preserved**, consolidation proposed, not executed.
4. Purpose/capabilities/tools/constraints/output extracted into the manifest.
5. Original prompt text preserved as `source_provenance.imported_prompt`
   (excerpt) — stored as data, **never executed as code**.
6. Global rules (single-file, honesty, secrets) live once in the constitution,
   not duplicated per agent, in the normalized version.
7. Risk ceilings and memory scopes added.
8. Personality text was **not** treated as a capability; tools were **not**
   granted because a prompt mentioned them.
9. Routing fixtures cover representative tasks (`jarvis/os/test/routing.test.js`,
   `agents.test.js`).

## Incomplete / open
- Consolidation of `ops-brief` into the board meeting: proposed, awaiting owner.
- Codex and Hermes real capabilities: pending owner-provided inventory.

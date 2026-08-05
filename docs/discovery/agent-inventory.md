# Discovery — Agent Inventory

Every agent found in the repository, captured **without modifying the
originals**. Source hashes are git blob SHA-1s at scan time (provenance).
`unknown` means the information is genuinely not determinable from the source —
it was not invented.

## Repository-local Claude agents (`.claude/agents/`)

### `biz-ops`
- **Source / hash:** `.claude/agents/biz-ops.md` · `45daaab3`
- **Purpose:** Business-problem and roadblock triage.
- **Capabilities:** Produce Impact / Proposed-fix / needsUser for any business
  problem; maintain `rory/knowledge/business.md`.
- **Tools / permissions:** "All tools" per harness registry (broad — flagged as
  a risk; normalized manifest narrows this).
- **Input expectations:** A business problem or roadblock, free-form.
- **Output format:** Impact (1 line) · Proposed (single best fix) · needsUser
  (bool, true only if irreversible / spends money / external).
- **Model assumptions:** `unknown` (none stated).
- **Dependencies:** `rory/state.json` (roadblocks), `rory/knowledge/business.md`.
- **Overlaps:** Escalation framing overlaps with the CEO/orchestrator.
- **Risks:** Broad tool grant; writes to knowledge base.
- **Recommended company role:** Operations / Strategy analyst (`ops-bizops`).
- **Migration status:** inventoried → manifest drafted.

### `daily-brief`
- **Source / hash:** `.claude/agents/daily-brief.md` · `e8445d29`
- **Purpose:** Compile the "since you left" brief; write it into `state.json`.
- **Capabilities:** Summarize git log since `meta.updated`, session work, open
  roadblocks/tasks; write `brief.items`.
- **Tools / permissions:** "All tools" (broad — narrowed in manifest).
- **Input expectations:** Session boundary (start/end).
- **Output format:** `brief.items[]` (kind: done|work|blocked) + spoken brief.
- **Model assumptions:** `unknown`.
- **Dependencies:** `git log`, `rory/state.json`.
- **Overlaps:** The board-meeting Operations-recorder role subsumes much of this.
- **Risks:** Writes to `state.json` (the live HUD state).
- **Recommended company role:** Operations recorder / briefing officer
  (`ops-brief`). Board meeting is the durable successor; agent stays for the HUD.
- **Migration status:** inventoried → manifest drafted.

### `demo-engineer`
- **Source / hash:** `.claude/agents/demo-engineer.md` · `5278bc36`
- **Purpose:** Own the demos group (AEGIS, RORY HUD presentation).
- **Capabilities:** Demo polish, QA passes, new demo builds, perf, cinematic
  capture. House rules: single-file, no-build, `file://`, three.js r128 vendored.
- **Tools / permissions:** "All tools".
- **Input expectations:** A demo task or QA request.
- **Output format:** `unknown` (code + a short report, by convention).
- **Model assumptions:** `unknown`.
- **Dependencies:** `index.html`, `rory/index.html`, `vendor/`, `js/`.
- **Overlaps:** Engineering department (but specialized to browser/demo).
- **Risks:** Edits the demo surfaces directly.
- **Recommended company role:** Engineering — front-end/demo specialist
  (`eng-demo`).
- **Migration status:** inventoried → manifest drafted.

### `sentinel-lead`
- **Source / hash:** `.claude/agents/sentinel-lead.md` · `821f106b`
- **Purpose:** Own Priority One — Sentinel development.
- **Capabilities:** Plan milestones, map the codebase, implement/fix, report
  status. Honesty rule: if the repo isn't attached, plan only.
- **Tools / permissions:** "All tools".
- **Input expectations:** A Sentinel task or status request.
- **Output format:** `unknown` (plan or code + status).
- **Model assumptions:** `unknown`.
- **Dependencies:** the Sentinel repo (separate; cloned at `/workspace/sentinel`).
- **Overlaps:** Engineering department; but domain-bound to Sentinel.
- **Risks:** Operates on a **separate repo** — cross-repo authority boundary.
- **Recommended company role:** Engineering — Sentinel domain lead
  (`eng-sentinel`).
- **Migration status:** inventoried → manifest drafted.

## Implicit orchestrator (not a file agent)

### `rory-chief-of-staff`
- **Source / hash:** defined by `CLAUDE.md` · `265a5615`; referenced throughout
  `rory/state.json` as `agents[].id`.
- **Purpose:** Chief of staff — reads state, delivers the brief, routes work,
  owns the state file.
- **Recommended company role:** **CEO / primary orchestrator** (`ceo-claude`).
- **Migration status:** promoted to CEO manifest; the `CLAUDE.md` protocol is
  preserved and referenced, not rewritten.

## External / not-yet-integrated

| Name | Where | Status |
|---|---|---|
| **Codex** | external (OpenAI) | To be integrated as CTO / independent technical reviewer. Capabilities **not** assumed — see `docs/operations/connect-codex.md`. |
| **Hermes** | external | `discovery_required`. No capabilities assumed. See `docs/integrations/hermes-capability-inventory.md`. |
| Harness built-ins (`Explore`, `general-purpose`, `Plan`, etc.) | Claude Code runtime | Not repo agents; not migrated. Available as execution substrate only. |

## Overlap / consolidation notes

- `daily-brief` ↔ board-meeting Operations recorder: **preserve both**; board
  meeting is the durable, evidence-based successor. Proposed consolidation is
  recorded, not executed (directive §15: never silently delete an overlap).
- `biz-ops` escalation ↔ CEO escalation: distinct scopes (business vs.
  orchestration); kept separate.

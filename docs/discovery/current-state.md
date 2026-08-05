# Discovery — Current State

Read-only inspection of the repository at bootstrap time. Nothing here was
changed during discovery.

## Repository

- **Path:** `/home/user/lockhead-martin-demo`
- **Git:** active repo, branch `claude/centlabs-roryd-daemon` at time of scan.
  Working tree clean. Recent history: glasses bridge + Node 001 data plane,
  CentLabs connect checklist, roryd daemon.
- **Nested git repos:** none (verified — no nested `.git`). The Rory OS is
  added inside this repo, not as a nested application.

## What already exists (preserved, not modified)

| Area | Location | Nature |
|---|---|---|
| AEGIS Overwatch demo | `index.html`, `js/`, `vendor/three.min.js`, `data/` | Single-file, no-build, `file://`-friendly WebGL demo |
| RORY command HUD | `rory/index.html`, `rory/state.json`, `rory/ledger.json` | Voice + dashboard surface; `state.json` is the live HUD state, `ledger.json` the daily-improvement log |
| Knowledge base | `rory/knowledge/{values,business}.md` | Owner's constitution seed + business facts (mostly placeholders) |
| Claude agents | `.claude/agents/{biz-ops,daily-brief,demo-engineer,sentinel-lead}.md` | 4 specialist subagents (see agent-inventory.md) |
| Operating protocol | `CLAUDE.md` | The RORY chief-of-staff protocol; defines the implicit orchestrator role |
| Sentinel | separate repo (`acevenen/sentinel`), cloned at `/workspace/sentinel` | Go security CLI; **not** part of this repo |
| roryd | `roryd/` | Python always-on voice daemon (wake word, brief, Wake-on-LAN) |
| CentLabs | `centlabs/` | Architecture record + glasses web-app bridge + Node 001 Compose data plane |
| Build tooling | `tools/*.mjs` | Node scripts to inline vendored deps / fetch world data |

## Stack observed

- **No `package.json`, `tsconfig.json`, or test runner** anywhere in the repo —
  the control plane is greenfield.
- Existing code is heterogeneous by design: browser JS (demos), Python
  (`roryd`), Go (Sentinel, separate repo), Markdown+JSON (the brain/HUD).
- **Runtime available:** Node **v22.22.2** (with `node:sqlite` and `node:test`
  built in, and `--experimental-strip-types`), Python **3.11.15**, npm 10.9.

## Decisions forced by the current state

1. **Integrate, don't compete.** The Rory OS is added under the existing
   `rory/` tree (`rory/brain/`, `rory/os/`, `rory/data/`) so it sits
   beside the existing HUD instead of forming a competing nested app. The
   existing `rory/state.json` and `rory/index.html` are left untouched.
2. **Zero-dependency local core.** Node 22 ships `node:sqlite` and `node:test`,
   so the operational core needs no npm install, no native build, and no API
   keys to run its tests. See `docs/decisions/ADR-0002-stack.md`.
3. **Provider isolation.** No provider SDK is imported; all model access is
   behind adapter interfaces with a mock default, so the core runs offline.

## Explicitly out of scope for this bootstrap

- No commit/push/deploy (owner approval required — directive §2.5).
- No VPS deployment; localhost binding only.
- No changes to global Claude/Codex MCP config.
- No hardware purchases for the hologram project.
- Sentinel's own repo is not modified from here.

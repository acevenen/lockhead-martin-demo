# Roles & departments

The agent company, by department. Manifests are in `../registry/`.

| Department | Role (id) | Purpose |
|---|---|---|
| Executive / Strategy | `ceo-claude` | Orchestrate: plan, route, synthesize, escalate. |
| Engineering | `cto-codex` | Architecture, implementation, debugging, tests, independent technical review. |
| Engineering | `eng-demo` | Demos group (AEGIS, RORY HUD, hologram front-end). |
| Engineering | `eng-sentinel` | Sentinel security CLI (separate repo). |
| Operations | `ops-bizops` | Business/roadblock triage → Impact/Proposed/needsUser. |
| Operations | `ops-brief` | Briefing officer (HUD brief; board meeting is the durable record). |
| Operations | `hermes` | Placeholder — `discovery_required`, no capabilities assumed. |
| Quality & Safety | `qa-reviewer` | Independent acceptance-criteria review. |
| Research | `research-reviewer` | Source/evidence review; claims need citations or stated uncertainty. |

Reviewer separation: workers list `reviewer_roles`; the CEO assigns a reviewer
whose role is in that list and is not the worker. Codex is the preferred
technical reviewer, with `qa-reviewer` as the always-available fallback.

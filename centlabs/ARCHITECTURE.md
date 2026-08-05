# CentLabs Workspace v1 — Architecture & Decision Record

> One computer, one brain, many interfaces. The intelligence lives on **CentLabs
> Node 001**; every device — MacBook, phone, glasses — is a window into it.
>
> **Guiding principle:** do not optimize for today. Optimize for the developer
> environment still in use five years from now. Local-first where practical,
> cloud-assisted when beneficial, secure and reproducible everywhere.

This document is the durable memory of the system's shape and the reasoning
behind each choice — so a decision is made once and never re-litigated or
re-explained. Every recommendation states **what**, **why**, and the **tradeoff
accepted**. It is a living document: when a decision changes, change it here and
say why.

---

## 0. Device topology

| Device | CentLabs role | Runs | Deliberately does NOT |
|---|---|---|---|
| **Gaming PC** (Ryzen 7 7700X · RTX 5060 Ti 16GB · 32GB · Win11) | **Node 001** — the always-on local AI server and the brain | local models, Hermes, memory DB, containers, schedulers | be a workstation you sit at |
| **MacBook Air M2** | Primary dev surface | Claude Code, Git, docs, meetings, architecture | heavy compute — that goes to Node 001 |
| **iPhone 16 Pro Max** | Daily control center; the eventual primary interface | Hermes client, notifications, Shortcuts | store the brain |
| **iPhone 14** (broken display) | Headless mobile node — sensors, testing, relay | beta apps, API/push/BLE/network tests, telemetry | hold personal or production data |
| **Meta Ray-Ban Display** | Interface, not intelligence | capture input, render results | reason — that happens on Node 001 |

**Why this split.** The Air stays light and travels; anything expensive runs on
hardware that never leaves the desk and never sleeps. The glasses and phones are
thin clients so that losing, breaking, or upgrading any of them costs nothing but
a re-pair — the state and the intelligence are always on Node 001.

---

## 1. The stack, top to bottom

```
  MacBook Air ─┐
  iPhone 16 ───┤                          (interfaces)
  iPhone 14 ───┤
  Ray-Bans ────┘
        │  Tailscale (encrypted mesh) + authenticated APIs
        ▼
  ┌─────────────────── CentLabs Node 001 ───────────────────┐
  │  Caddy/Traefik  →  Hermes (orchestrator)                │
  │                      ├── Model Router                    │
  │                      ├── Memory (RAG): Postgres + Qdrant │
  │                      ├── Tools: Sentinel, Spotter, n8n   │
  │                      └── Local models: Ollama (+ GPU)    │
  │  Redis · SearXNG · monitoring · logging · backups        │
  └──────────────────────────────────────────────────────────┘
        │  GitHub (source of truth for code + config)
        ▼
  Reproducible: every service is a container defined in Compose.
```

Everything below Hermes is stateless-to-rebuild except two volumes that ARE the
system: the Postgres data and the Qdrant collections. Those are what backups
protect (Phase 8/9).

---

## 2. Phase decisions

Each phase: the decision, why, the tradeoff, and how it connects to what already
exists in this workspace (Sentinel, Spotter, the RORY HUD, the `roryd`
daemon).

### Phase 1 — Infrastructure

**Container runtime — the requested analysis.**

| Option | For | Against |
|---|---|---|
| **Docker Desktop** | Most turnkey NVIDIA GPU passthrough on Windows via WSL2 + NVIDIA Container Toolkit; best Compose DX; huge ecosystem | Heavier VM; commercial license required only for large orgs (free for personal use) |
| **Rancher Desktop** | Open-source, free, WSL2-based (moby engine), optional k3s if you ever want Kubernetes; same Compose files | GPU story works but slightly more setup than Docker Desktop |
| **Podman Desktop** | Daemonless, rootless — best security posture | NVIDIA CUDA passthrough on Windows historically the most friction of the three |

**Decision: Docker Desktop now, but author everything as portable Compose so the
runtime is swappable.** The binding constraint is smooth RTX 5060 Ti passthrough
to the Ollama container, and Docker Desktop's WSL2 GPU path is the least-friction
option that exists today. **The important architectural move is that the choice
is reversible:** because every service is a plain `compose.yaml`, Rancher Desktop
(free/open) and Podman both consume the same files, so switching runtimes later
is a config change, not a redesign — which is exactly the five-year test.
_Tradeoff accepted:_ a proprietary desktop app in the loop today, bought back by
keeping the actual service definitions runtime-neutral.

**Services (all containerized, all in Compose):**

| Service | Role | Why |
|---|---|---|
| **Ollama** | local model host (GPU) | the default answer to most requests; keeps calls off paid APIs |
| **Open WebUI** | chat UI over local models | a human front door while Hermes matures |
| **PostgreSQL** | source of truth: memory metadata, tags, versions | relational integrity + easy backup |
| **Qdrant** | vector search for RAG | purpose-built, fast filtered search, simple ops |
| **Redis** | cache + job queue for Hermes | fast, boring, proven |
| **n8n** | visual workflow automation | Phase 8 automation without bespoke code |
| **SearXNG** | private metasearch | research without leaking queries |
| **Caddy** (over Traefik) | reverse proxy + automatic TLS | simplest correct TLS; Traefik only if you outgrow it |
| **Tailscale** | mesh VPN | Phase 2 |
| **Prometheus + Grafana + Loki** | metrics + logs | Phase 6 dashboard data |

_Non-negotiable:_ **no manual configuration that cannot be recreated.** One
`compose.yaml` per concern, one `.env` (secrets injected, never committed), one
`make up`. If a service can't be rebuilt from the repo, it isn't done.

### Phase 2 — Networking

**Decision: Tailscale as the single fabric.** MagicDNS so `node001` resolves
everywhere; SSH over Tailscale (keys only, passwords off); VS Code / Claude Code
Remote-SSH into Node 001 so the Air stays thin; file sync via `git` for code and
Syncthing (over the tailnet) for large non-code artifacts; secrets via a `.env`
kept out of git plus, later, a self-hosted vault.

_Why:_ Tailscale gives an encrypted, zero-config mesh where the Air "feels
plugged into Node 001" from anywhere without exposing a single port to the public
internet. _Tradeoff:_ dependence on Tailscale's coordination server for key
exchange (the data path stays peer-to-peer) — acceptable, and Headscale is the
self-hosted escape hatch if that ever matters.

### Phase 3 — Hermes (orchestration)

**Decision: Hermes is one service on Node 001 — the single front door.** A small
FastAPI app that every device calls over the tailnet. Responsibilities: route
each request to the right model, look up shared memory (RAG), execute tools
(Sentinel, Spotter, shell, n8n webhooks), schedule work, and keep an audit trail.
Redis holds its queue; Postgres holds its history.

_Why one door:_ every interface (Mac, phone, glasses, `roryd`) speaks one API
and inherits routing, memory, and tools for free — add an interface, get the
whole brain. _Tradeoff:_ Hermes is a single point of failure; mitigated by
`Restart=always`, health checks (Phase 6), and the fact that it is stateless to
rebuild.

### Phase 4 — Shared memory (the most important component)

**Decision: Postgres (truth) + Qdrant (search) + an Ollama embedding model,
behind a Hermes `/memory` API. Never isolated per-agent context.**

- **Ingestion:** a watcher indexes repos, notes, design docs, meeting notes,
  prompt history, benchmarks. It chunks, embeds (`nomic-embed-text` or `bge` on
  Ollama), and writes both a Postgres row (source, offsets, tags, `project`,
  `version`, timestamp) and a Qdrant point (vector + the same metadata as
  payload).
- **Semantic search** is a Qdrant query filtered by `project`/tag; **citations**
  come from the stored source + offsets, so every answer can point at its
  origin; **version history** is append + soft-delete, so nothing is lost and you
  can ask "what did this doc say last month"; **project separation** is a filter,
  not a separate store, so cross-project search is still possible when wanted.
- Projects tracked from day one: **Sentinel, Ever Dashboard, CentLabs, Research,
  Architecture Decisions, Meeting Notes, Ideas, Security Research, Benchmarks,
  Source Code, Prompt History, Design Docs, Documentation, Roadmaps, Personal KB.**

_Why this shape:_ relational truth + vector search is the boring, durable pattern
that will still be right in five years; keeping Postgres as the system of record
means Qdrant can be re-embedded from scratch after a model upgrade without data
loss. _Tradeoff:_ two datastores to back up instead of one — worth it, because
collapsing them (e.g. pgvector only) trades search quality and operational
clarity for a simplicity you don't actually need here.

> This document, and the RORY `state.json`/`ledger.json`, are the first
> entries in that memory — the workspace already refuses to explain itself
> twice.

### Phase 5 — Model routing

**Decision: rules first, classifier second, cost-aware always.** Hermes tries the
cheapest correct option and escalates only when it must.

| Request | Route | Why |
|---|---|---|
| simple coding | local code model (Ollama) | free, fast, private |
| security reasoning | **Sentinel** | authorization-first, auditable |
| long-form architecture | Claude | strongest at structure/long-context |
| research | GPT | breadth |
| massive reasoning | Kimi API | when the job genuinely needs it |
| retrieval | embedding model | pennies, instant |

_Why:_ "never waste an expensive API call if a local model can solve the task" is
a routing policy, not a vibe — encode it. Start with an explicit rules table
(transparent, debuggable); add a small learned classifier only once the rules
show their limits. _Tradeoff:_ a rules table needs occasional tending; that
visibility is the feature.

### Phase 6 — CentLabs Control Center

**Decision: one dashboard, fed by Prometheus/Grafana + Hermes's own status API.**
GPU/CPU/containers/models from exporters; Hermes/Sentinel/memory/tasks/GitHub/
device status from Hermes. The existing **RORY HUD** (`rory/index.html`) is
the design language and the seed of this — it already renders a live `state.json`
and polls `roryd` on `:8791`. Control Center is that HUD, widened, pointed at
Hermes instead of a static file.

_Tradeoff:_ Grafana for machine metrics + a custom panel for CentLabs-specific
state, rather than forcing everything into one tool. Two panes, each good at its
job, beats one mediocre pane.

### Phase 7 — Developer workflow

Wake → open Air → everything reconnects. Tailscale reconnects automatically;
Node 001 was never off; memory is already indexed; Hermes is up; Claude Code
attaches over Remote-SSH; git syncs; `roryd` already greeted you with the
brief. **No repetitive setup** is the acceptance test for the whole system — if a
morning needs manual steps, that's a bug to automate away in Phase 8.

### Phase 8 — Automation

n8n + scheduled jobs on Node 001: repo indexing and embedding on push, nightly
encrypted backups of the two data volumes, model pulls, doc/summary generation,
log rotation, DB snapshots, scheduled health checks. **Docker image updates run
with approval, never silently** — updates are the most common way an automated
system breaks itself. The RORY **daily improvement ledger** is the automation
that enforces the standing rule that every day ships an improvement and names the
pain it removed.

### Phase 9 — Security

Least privilege (per-service containers, no root where avoidable); secrets
encrypted and environment-injected, never committed; TLS everywhere via Caddy;
SSH keys only; container isolation; encrypted offsite backups; audit logging
(Sentinel's hash-chained audit log is the model); secure remote access via
Tailscale ACLs rather than open ports. **Every security decision is written down
here with its reasoning** — an undocumented control is one you'll disable by
accident.

### Phase 10 — Future growth, without redesign

Bigger local models (the RTX 5060 Ti's 16GB sets today's ceiling; swap the GPU,
not the architecture); additional AI servers (Hermes routes across nodes the same
way it routes across models); a Linux migration for Node 001 (every service is
already a container — the `roryd` daemon ships a `systemd --user` unit for
exactly this); multiple GPUs; voice (the `roryd` wake-word daemon is the first
piece); robotics; home automation (Home Assistant is already the WoL bridge);
CentLabs products and customer deployments. **Each is additive because the seams
are APIs and containers, not hard-wired assumptions.**

---

## 3. What already exists and where it slots in

| Built | CentLabs layer |
|---|---|
| **Sentinel** (Go security platform, authorization-first, hash-chained audit) | a Hermes tool + the model for Phase 9 audit logging |
| **Spotter** (device identification + vuln triage; glasses HUD contract) | a Hermes tool; the Ray-Ban interface's first real capability |
| **RORY HUD** (`rory/index.html`, live `state.json`) | the seed of the Phase 6 Control Center |
| **`roryd`** (always-on wake-word daemon, brief, ledger, WoL) | the Phase 7 morning workflow + Phase 10 voice + Node 001 power-on |
| **AEGIS** (holo-tactical demo) | the interface-design language for the glasses |

Nothing here is throwaway: each piece is a component of the same system, not a
separate project.

---

## 4. Build order (do this, in this sequence)

Phases are layers, not a schedule. Build bottom-up so each step stands on a
working one:

1. **Node 001 base:** Windows + WSL2 + Docker Desktop + NVIDIA toolkit; `git`
   pull the CentLabs repo. Verify GPU reaches a container.
2. **Tailscale** on all five devices; SSH + Remote-SSH from the Air. Now it feels
   plugged in.
3. **Compose up the data plane:** Ollama (+ a model), Postgres, Qdrant, Redis,
   Caddy. Health-check each.
4. **Memory ingestion:** index this repo first. Prove semantic search + citations
   over real content.
5. **Hermes v0:** one `/ask` endpoint, the rules-based router, `/memory` lookup.
   Point `roryd` and the HUD at it.
6. **Control Center:** Grafana + the widened RORY HUD against Hermes.
7. **Automation + backups + security hardening**, then the iPhone 14 node.

Ship one layer, confirm it, then the next. Never two unproven layers at once.

---

See **[MOBILE-NODE.md](MOBILE-NODE.md)** for the iPhone 14 headless-node design
and the full recovery runbook.

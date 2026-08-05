# Architecture overview

Rory is a local-first, multi-agent control plane with a governed shared brain.
The intelligence (durable truth) lives in the brain; agents are interfaces into
it that propose changes and do bounded, reviewed work.

## Two layers of memory
- **Canonical, human-readable** (`rory/brain/`, version-controlled): mission &
  constitution, owner profile & goals, agent manifests, project charters,
  curated lessons. The source of truth for durable facts.
- **Operational** (`rory/data/rory.db`, SQLite, gitignored): tasks, an
  **append-only event ledger**, memory proposals, artifacts, reviews, lessons,
  failures, routing decisions, runs, handoffs. Derived views rebuild from events.

## The control plane (`rory/os/`, zero-dependency ESM)
```
contracts/  JSON-Schema contracts + a small validator + shared enums
db/         node:sqlite schema + connection wrapper (idempotent migrate)
events/     append-only EventLedger (the audit spine)
tasks/      TaskEngine — deny-by-default state machine, delegation/retry caps
memory/     proposal-first durable memory, approval policy, conflict→disputed, FTS5
agents/     AgentRegistry + brain-manifest loader
artifacts/  provenance-tracked outputs (content hashes)
review/     ReviewEngine — reviewer separation, no self-approval of high-risk
learning/   FailureLog + LessonBook (a lesson activates only when verified)
routing/    ModelRegistry (profiles, not model ids) + deterministic Router
providers/  MockProvider default; Anthropic/OpenAI/Ollama fail closed until configured
orchestrator/ CEO plan→route→run→review→complete loop + the mocked scenario
board/      24h board meeting (Markdown+JSON) + scored action plan
handoff/    validated handoff envelopes
mcp/        governed tool boundary (descriptors + handlers), transport-separate
core/       context.js wires it all; cli/ is the entry point
```

## Request flow (a task)
1. CEO **plans** an objective into bounded tasks (`proposed→planned→queued`).
2. **Router** picks agent + model profile deterministically and records why.
3. Worker runs; output is a **registered artifact** with verification.
4. **Reviewer** (≠ worker) approves or requests changes; completion = criteria
   verified.
5. Failures become **lessons** that activate only after a passing check.
6. Everything emits **events**; the **board meeting** summarizes the last 24h.

## Portability
Providers, storage, and MCP transport are behind interfaces, so models, the DB
(SQLite→Postgres), and the transport (stdio→HTTPS) can change without redesign
(`../operations/vps-migration.md`).

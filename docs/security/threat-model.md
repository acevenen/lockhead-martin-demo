# Rory OS — Threat Model

Scope: the local-first control plane under `rory/os/`, its canonical memory in
`rory/brain/`, and its operational database in `rory/data/rory.db`. This
phase binds to `localhost` only, uses stdio-first MCP, and ships with zero
external npm dependencies. The model below pairs each threat with the concrete
control that addresses it in the code as built.

## Threats and controls

| Threat | One-line description | Control in this system |
|---|---|---|
| Prompt injection via imported docs / agent prompts | An imported document or agent prompt contains instructions intended to hijack behavior. | Imported prompts are stored as **provenance data, never executed as code**. Agent manifests record a source hash (ADR-0011); imported text is content to reason about, not control flow. |
| Malicious MCP tool output | A tool returns crafted output aiming to steer an agent or corrupt state. | MCP tools are narrow and governed (ADR-0006); outputs cross a schema-validated seam (`contracts/validator.js`) and cannot write durable memory or complete tasks directly — those go through proposal-first memory and independent review. |
| Agent impersonation | One agent acts or writes as another to dodge review or attribution. | **Agent identity is stamped on every event and every write** (`events/EventLedger`, memory rows). Reviewer separation (ADR-0009) depends on this identity being present and truthful. |
| Unauthorized memory reads | An agent reads memory outside its remit (e.g. identity/restricted scopes). | **Default-deny scopes.** Reads are scoped; identity/restricted content is not returned to callers without the right scope. Cloud egress of restricted/identity data is additionally blocked by the router `privacy` field (ADR-0005). |
| Memory poisoning | False or adversarial "facts" are written to durable memory. | **Proposal-first memory** with an approval policy (ADR-0007); sensitive scopes require owner approval; conflicts become `disputed` rather than silently merged; corrections supersede without erasing provenance. |
| Secret leakage | Keys, tokens, or passwords end up in logs, memory, or the repo. | **Redaction in the logger**; `MemoryRepository` **refuses to store secrets**; `.env` holds env-var **names only**, never values; `rory/data/` is **gitignored**. |
| Excessive tool permission | An agent holds broader tool access than its job needs. | Manifests **narrow the tool set** per agent; the imported agents' "All tools" grants were **narrowed** during normalization (ADR-0011). Deny by default — a missing tool blocks the workflow rather than being implicitly granted. |
| Unsafe shell execution | An agent runs arbitrary or destructive shell commands. | No general shell tool is exposed by default; actions are expressed as governed MCP tools, and anything high-risk is gated behind approval and independent review before it can complete. |
| Supply-chain compromise | A malicious or compromised dependency ships code into the system. | **Zero external npm dependencies** (ADR-0002): `node:sqlite`, `node:test`, `node:crypto`. No dependency tree, no lockfile, no native build to compromise. |
| Public exposure of a local service | The control plane is reachable from the network before governance is proven. | **`localhost` binding**, **stdio-first MCP**, no open ports, no public deploy this phase (ADR-0010). |
| Autonomous external actions | An agent takes a hard-to-reverse external action without oversight. | **Approval gates** on sensitive and high-risk operations; unreviewed high-risk work cannot reach `completed` (ADR-0007, ADR-0009). |
| Corrupted or misleading agent reports | An agent's self-report overstates progress or hides failure. | The **board reads the append-only ledger, not agent summaries** (`board/BoardMeeting`); completion requires **independent verification** (ADR-0008, ADR-0009). |
| Cost runaway | Runs consume unbounded tokens or money. | **Per-run budgets and timeouts** enforced by the orchestrator/task engine; routing records cost class per profile (ADR-0005). |
| Recursive / runaway delegation | Agents delegate in loops or fan out without limit. | **Delegation-depth caps and retry limits** in the `TaskEngine` state machine, with deny-by-default transitions. |
| Deletion / ransomware failure modes | Data is deleted, encrypted, or otherwise destroyed. | **Append-only ledger** (no update/delete) is the recoverable spine; derived views rebuild from it; export/backup is documented (see `docs/operations/vps-migration.md`). |

## Required controls checklist

Mirrors directive §18. These are non-negotiable for this phase:

- [x] **Localhost binding** — no network exposure of the control plane.
- [x] **Default-deny scopes** — memory reads/writes denied unless scope permits.
- [x] **Schema validation** at every seam — `contracts/validator.js` over JSON-Schema contracts.
- [x] **Secret redaction** — logger redaction; memory refuses secrets; `.env` holds names only; `data/` gitignored.
- [x] **Append-only audit** — the event ledger is append-only; derived views are rebuildable.
- [x] **Agent identity on writes** — every event and durable write is attributed to an agent.
- [x] **Approval gates** — sensitive scopes and high-risk actions require owner approval.
- [x] **Timeouts, retries, and budgets** — per-run limits in the orchestrator/task engine.
- [x] **Dependency minimization** — zero external npm dependencies; Node built-ins only.
- [x] **No execution of imported agent content as code** — imported prompts are provenance, never executed.
- [x] **No public deploy** — stdio-first MCP, localhost only, in this phase.

# Jarvis OS — VPS Migration Plan (Not Executed Now)

> **Do not deploy now.** This phase is **localhost only**: `localhost` binding,
> local SQLite, stdio-first MCP, no public exposure (ADR-0010). This document is a
> forward plan for a later phase. Nothing here is to be provisioned or run until
> the owner explicitly decides to migrate.

## Why this is a config move, not a redesign

Every boundary that would change when moving to a server is already an interface:
the provider adapter (ADR-0004), storage access, the MCP tool surface (ADR-0006),
and the router (ADR-0005). The append-only ledger (ADR-0008) makes state
portable and derived views rebuildable. Memory `sensitivity` and router `privacy`
fields already encode what may leave the machine. As a result, the migration
below changes **configuration, transport, and hosting** — not the architecture.

## Migration plan

### Containerization
Package the control plane as a container image (Node 22 base). Keep the image
minimal — no build step to reproduce, since there are no external deps. Mount
data and secrets rather than baking them in. Pin the base image by digest.

### Authenticated MCP over HTTPS
Switch the MCP transport from stdio to **authenticated HTTP over TLS**. Terminate
TLS at a reverse proxy, require per-agent credentials, and keep the tool surface
identical to the local build so agents and contracts are unchanged.

### Optional PostgreSQL migration
Storage access is already abstracted, so SQLite can be swapped for **PostgreSQL**
when concurrency or multi-host access demands it. Migrate by replaying/exporting
the append-only ledger into the new store; derived views rebuild from it. Keep
SQLite as the local/dev default.

### Encrypted backups
Automated, **encrypted** backups of the database and the `jarvis/brain/` canonical
files. Store off-host, encrypted at rest, with periodic **restore drills** — an
untested backup is not a backup. The ledger is the primary thing to protect.

### Secret management
Secrets live in the **environment or a secret store** (never the repo, never the
DB, never memory). `.env` continues to hold names only. Rotate on a schedule and
on any suspected exposure. Grant secrets per service, not globally.

### Private networking / VPN
Prefer a **private network** (e.g. Tailscale or an equivalent WireGuard mesh) so
the control plane and MCP endpoint are reachable only by authorized nodes, not the
public internet. Public ingress, if ever needed, sits behind the proxy and auth.

### Worker isolation
Run agent workers in **isolated units** (separate containers/namespaces) with
their own least-privilege service accounts, so a compromised worker cannot reach
another's data or the host. Enforce the same narrow tool grants as the manifests.

### Monitoring
Centralize logs (with the same secret **redaction** as local), metrics, and
alerts. Watch task throughput, review backlog, error/timeout rates, routing
decisions, and budget consumption. Alert on stalled `awaiting-review` queues.

### Cost ceilings
Enforce **per-run and aggregate budgets** server-side with hard cutoffs and
alerts before limits are hit. Routing already records a cost class per profile;
surface spend by profile and by agent.

### Update / rollback
Immutable, **versioned image deploys** with a fast rollback to the previous
known-good image. Run schema migrations forward-compatibly; keep a tested
down/rollback path. Never hot-edit a running container.

### Disaster recovery
Documented RPO/RTO targets. Recovery = restore the encrypted DB backup (or replay
the ledger) plus the git-versioned `brain/` files, then rebuild derived views. DR
drills on a schedule.

### Data export & deletion
Provide first-class **export** (ledger + memory + brain files) and a governed
**deletion** path that respects append-only semantics — deletions are recorded as
events and honored in derived views, not silent row removals. This supports both
owner data rights and clean teardown.

### Local-only vs. cloud-eligible memory
Honor the existing classification: memory `sensitivity` and router `privacy`
(`local` vs `cloud`) already decide egress. In a hosted setup, **local-only**
memories stay on a local/private profile and are never sent to a cloud provider;
the router continues to refuse restricted/identity-scoped data to cloud profiles.

### Scheduler for the daily board meeting
Schedule the board meeting as a recurring job (e.g. cron/systemd timer) in
**America/Los_Angeles**, reading the preceding 24h from the append-only ledger and
emitting the Markdown + JSON action plan. It must be idempotent and re-runnable.

### Health checks
Expose **liveness/readiness** endpoints for the control plane and MCP endpoint so
the orchestrator (or the platform) can restart unhealthy workers. Health checks
must not leak internal state or secrets.

### Least-privilege service accounts
Each service and worker runs under its **own least-privilege account** with only
the scopes and tools it needs — mirroring the narrowed agent manifests. No shared
superuser credentials; no ambient host access.

## Guardrail

None of the above is provisioned in this phase. The system remains localhost-only
until the owner explicitly authorizes migration, and the move, when it happens,
reuses the existing interfaces and contracts without redesign.

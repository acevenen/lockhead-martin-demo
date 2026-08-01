# jarvis-os — the shared-brain control plane

Local-first, **zero external dependencies** (Node 22 built-ins: `node:sqlite`,
`node:test`). No build step, no API keys required for tests.

## Quick start
```bash
cd jarvis/os
node cli/jarvis.js demo:e2e     # mocked end-to-end workflow (safe, in-memory)
node cli/jarvis.js init         # create the operational DB + load agent manifests
node cli/jarvis.js status       # one-glance status
node cli/jarvis.js board        # today's board meeting (writes MD + JSON)
node --test                     # run the 48-test suite
```

## Layout
See `../../docs/architecture/overview.md`. Every service is a small module under
its own directory; `core/context.js` wires them; `cli/jarvis.js` is the entry
point.

## Guarantees the tests hold
- Contracts validate; illegal task transitions are rejected; delegation/retry are
  capped.
- Durable memory is proposal-first; identity/goals/restricted need approval;
  secrets are refused; conflicts become `disputed`.
- Routing is deterministic and recorded; identity-scoped data stays on a local
  model profile.
- High-risk output can't be self-approved; a lesson activates only when verified.
- The board meeting reads the append-only ledger and reports "no activity"
  honestly.

## Configuration
- `JARVIS_DB_PATH` — DB location (default `jarvis/data/jarvis.db`).
- `jarvis/os/config/model-profiles.json` — model profiles; concrete model ids
  come from the env vars named there (`model_env`), never hardcoded.

# Quickstart

Everything here is **local** and reversible. No API keys, no network, no build.

## Run the mocked end-to-end workflow (safest first look)
```bash
cd rory/os
node cli/rory.js demo:e2e
```
This plans the hologram objective into tasks, routes the first to `eng-demo`,
runs a worker→review→correction→approval loop, records and verifies a lesson, and
prints a board report — entirely in memory with the mock provider.

## Run the tests
```bash
cd rory/os
node --test          # 48 tests, no keys required
# or: npm test
```

## Initialize the real operational store
```bash
cd rory/os
node cli/rory.js init      # creates rory/data/rory.db, loads agent manifests
node cli/rory.js status
node cli/rory.js agents
```

## Generate today's board meeting
```bash
node cli/rory.js board                 # writes rory/brain/board/DATE.md + rory/data/board/DATE.json
node cli/rory.js board --regenerate    # overwrite
```

## Your data — you control it
- The operational DB is `rory/data/rory.db` (gitignored). Delete the file to
  reset all operational state; the human-readable brain in `rory/brain/` is
  untouched by that.
- **Export:** `sqlite3 rory/data/rory.db .dump > backup.sql` (or copy the
  file). The event ledger is append-only, so an export is a full audit trail.
- **Approvals:** `node cli/rory.js approvals` lists durable-memory proposals
  waiting on you.

## Secrets
None are needed to run any of the above. When you later connect real models,
set env vars named in `.env.example` — **never** put keys in the repo.

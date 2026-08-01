# jarvis/data — operational store (local, gitignored)

Runtime state only. Nothing here is canonical truth — the human-readable brain in
`../brain/` is. This directory is safe to delete to reset operational state.

- `jarvis.db` — the SQLite operational store (tasks, events, memory, agents,
  artifacts, reviews, lessons, failures, routing, runs, handoffs). Created by
  `node ../os/cli/jarvis.js init`. Gitignored.
- `board/YYYY-MM-DD.json` — machine-readable board reports (the readable Markdown
  lives in `../brain/board/`). Gitignored.

**Export / backup:** `sqlite3 jarvis.db .dump > backup.sql`. The event ledger is
append-only, so a dump is a complete audit trail.

**Reset:** delete `jarvis.db*` — the brain and your agents are unaffected.

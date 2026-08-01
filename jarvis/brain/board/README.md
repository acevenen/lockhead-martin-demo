# Board meetings

Daily board reports land here as `YYYY-MM-DD.md` (readable) with a machine copy
at `jarvis/data/board/YYYY-MM-DD.json`.

## How it works
`jarvis/os/board/meeting.js` reads the **append-only event ledger** for the
preceding 24 hours (timezone **America/Los_Angeles**) — never a mutable summary —
so it cannot invent activity. If nothing happened, it says so.

## Generate today's report
```bash
cd jarvis/os
node cli/jarvis.js board            # writes the two files; refuses to overwrite
node cli/jarvis.js board --regenerate
```

## What's in it
Executive summary · progress toward goals · work completed (24h) · verification
status · bugs/failures/risks · dissenting views · lessons proposed/verified ·
resource & model usage · blockers needing your decision · today's recommended
action plan · the three highest-leverage actions · items requiring approval.

The action plan scores candidates by goal impact, urgency, dependency, learning
value, and confidence, minus effort and risk (weights in
`ACTION_WEIGHTS`, configurable).

Idempotent by date. Not yet scheduled — run it manually (a scheduler is part of
the VPS-migration plan, `docs/operations/vps-migration.md`).

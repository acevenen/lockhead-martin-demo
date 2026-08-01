# Active goals

Concrete, time-bound goals that ladder up to the north star. Each has an `id`
that tasks reference via `parent_goal`. Status is honest: `unknown` where the
owner hasn't set a target.

## goal-hologram — Ship the interactive finger-tracked hologram demo
- **Why:** first end-to-end project that validates the company system.
- **Definition of done:** see `../projects/hologram/charter.md`.
- **Milestones:** camera+landmarks → fingertip cursor → one manipulable object →
  pinch+debounce → drag → smoothing → holographic treatment → reflector prototype
  → rehearsal.
- **Status:** planning; spikes scaffolded by the mocked workflow.

## goal-sentinel — Advance Sentinel (Priority One)
- **Why:** the owner's top priority.
- **Current:** PR #5 (Spotter engine) open and green. Next proposed milestone:
  audit-chain tamper tests + authorization-contract fuzzing.
- **Status:** active, tracked in the Sentinel repo (a separate authority
  boundary).

## goal-platform — Stand up the shared brain + Node 001 data plane
- **Why:** the substrate every agent runs on.
- **Current:** this bootstrap (control plane) + the CentLabs data plane + glasses
  bridge.
- **Status:** foundation built locally; owner steps (Docker, Tailscale) pending.

## Owner to add
- Health / sustainability goal(s): `unknown` — owner defines the metric and
  target.
- Revenue / business goal(s): `unknown`.

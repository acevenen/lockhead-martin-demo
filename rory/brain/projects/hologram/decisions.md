# Hologram — decisions

Project-level decisions. Architecture-wide decisions live in `docs/decisions/`.

## D-1 — Hand tracking: MediaPipe Hands (proposed)
- **Context:** need reliable browser hand/finger tracking with low setup.
- **Proposed:** MediaPipe Hands (well-supported, runs client-side).
- **Status:** proposed — confirm after Milestone 1 measures fps on the owner's
  hardware. Alternative: handpose/TF.js if MediaPipe underperforms.

## D-2 — Where the application code lives (RESOLVED → option a)
- **Context:** this repo is the demos/AEGIS + Rory platform repo. The hologram
  app could live here (as another single-file demo) or in a dedicated repo.
- **Options:** (a) here under a `hologram/` dir following the single-file no-build
  house style; (b) a new dedicated repo.
- **Decision:** (a) — the spike lives at `hologram/` (single-file `index.html` +
  a Node-tested `lib/`). Fastest to a demo, matches house conventions.
  **Reversible:** promote to its own repo if it outgrows this. Owner may override.
- **Status:** RESOLVED (proceeding on owner's "keep going"). Revisit if the app
  grows a backend or heavy build.

## D-3 — Physical reflector (Pepper's Ghost): stretch goal (proposed)
- **Context:** the acrylic reflector sells the "hologram" look but adds optics +
  hardware risk.
- **Proposed:** keep it a **stretch** goal; the on-screen demo is the core
  deliverable. No hardware purchased.
- **Status:** proposed.

## D-4 — Smoothing filter (proposed)
- **Proposed:** one-euro filter for fingertip smoothing (good jitter/latency
  trade-off). Confirm after Milestone 2.

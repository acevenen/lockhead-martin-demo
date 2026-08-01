# Project charter — Interactive finger-tracked hologram

## Objective
Build a small interactive "hologram image" demonstration in which a user's
tracked fingers manipulate glowing, spatial-looking images. This is the **first
end-to-end project** used to validate the Jarvis company system.

## Definition of "demo complete"
A person stands in front of the setup and, **hands-free of any controller**:
1. Sees a glowing image/object floating in a dark field.
2. Points with the index finger and a cursor tracks the fingertip stably
   (jitter < ~5px after smoothing).
3. **Pinches to grab** the object (debounced — no double-fire), **drags** it, and
   releases.
4. Optionally scales/rotates if it can be made reliable.
5. Runs for a full ~2-minute rehearsal without a crash or a lost-tracking stall.

A reflector (Pepper's-Ghost-style acrylic) enclosure is a **stretch**; the core
demo is complete on screen alone.

## Known likely MVP direction (hypotheses, not requirements)
- Browser-based; local; no backend unless justified.
- Webcam hand tracking via **MediaPipe Hands** (or an equivalent supported
  solution).
- **Three.js / WebGL** for the glowing layered image/object.
- Index-finger pointing; pinch-to-grab; drag; scale/rotate if reliable.
- Coordinate smoothing (e.g. one-euro filter) to reduce jitter.
- Dark backdrop/enclosure; optional clear-acrylic reflector.
- Laptop + existing screen assumed until the hardware inventory says otherwise.

## Assumptions & unknowns
- Owner's exact computer/GPU, camera, and display: **unknown** — see the
  hardware questionnaire in `current-state.md`.
- Lighting conditions at demo time: unknown.
- Whether a physical reflector is in scope for v1: **decision pending**
  (`decisions.md`).

## Risks
- Hand-tracking latency/jitter ruining the feel → smoothing + debounce (already a
  verified lesson from the mocked run).
- WebGL performance on the owner's hardware → measure early.
- Reflector optics harder than expected → keep it a stretch goal.
- Scope creep (scale/rotate/multi-hand) → gate behind reliability.

## Where the code should live
Project-management state (this charter, decisions, backlog) lives here in the
brain. The **hologram application code itself** should live in its own directory
or repo — **decision pending** (`decisions.md`, D-2). Until decided, spikes are
referenced by path only.

## First CEO routing exercise
The mocked end-to-end run (`jarvis/os/orchestrator/scenario.js`) already decomposes
this objective into three bounded tasks, routes the first to `eng-demo` on the
`coding_primary` profile, runs a worker→review→correction→approval loop, and
records a verified debounce lesson. That is the template for the real work.

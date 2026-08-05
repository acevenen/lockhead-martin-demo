# Hologram — backlog

Milestones and the initial task backlog. Acceptance criteria are the contract;
"done" means verified against them by a reviewer, not self-declared.

## Milestones
1. Camera feed + hand landmarks
2. Stable fingertip cursor mapping
3. One manipulable visual object
4. Pinch detection with debouncing
5. Drag interaction
6. Motion smoothing
7. Holographic visual treatment
8. Physical reflector prototype (stretch)
9. Demo rehearsal + reliability pass

## Initial task backlog

### T1 — Spike: webcam + MediaPipe hand landmarks (Milestone 1)
- **Acceptance:** camera feed renders; hand landmarks logged/drawn at >15fps in
  the browser.
- **Risk:** medium · **Capabilities:** frontend, prototyping · **Agent:** eng-demo

### T2 — Fingertip → stable cursor (Milestone 2)
- **Acceptance:** cursor tracks the index fingertip; jitter < 5px after smoothing.
- **Risk:** low · **Capabilities:** frontend · **Agent:** eng-demo

### T3 — One glowing manipulable object: pinch-grab + drag (Milestones 3–5)
- **Acceptance:** pinch detected with debounce (no double-fire); object drags with
  the hand and releases cleanly.
- **Risk:** medium · **Capabilities:** frontend, 3d · **Agent:** eng-demo

### T4 — Motion smoothing pass (Milestone 6)
- **Acceptance:** one-euro (or equiv.) filter applied; measured jitter reduction.

### T5 — Holographic visual treatment (Milestone 7)
- **Acceptance:** glowing layered look on a dark field; readable on the owner's
  display.

### T6 — Reflector prototype (Milestone 8, STRETCH)
- **Acceptance:** on-screen image visibly floats via the acrylic reflector. No
  hardware purchased without approval.

### T7 — Rehearsal + reliability (Milestone 9)
- **Acceptance:** ~2-minute run with no crash and no unrecovered tracking stall.

## Acceptance tests (as they land)
Each milestone gets a regression check where practical (e.g. the debounce lesson
already prescribes a pinch-edge regression test). "Verified" requires the check
to pass or a reviewer to approve.

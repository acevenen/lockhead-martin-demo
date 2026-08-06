# Hologram spike

The first end-to-end project deliverable: a glowing object on a dark field you
manipulate with your fingertip. This is the **spike** (Milestones 1–4 + 6) — the
interaction feel proven and tested; a physical reflector is a later stretch.

## Run it
```bash
cd hologram
python3 -m http.server 8815     # any static server; camera needs a secure context
# open http://127.0.0.1:8815/
```
- **Default = pointer mode:** move to aim, **click/press = pinch**, drag, release.
  Runs with no camera and no network.
- **Camera mode (opt-in):** click **TRY CAMERA**. Loads MediaPipe Hands and uses
  your webcam (index fingertip = cursor, index-to-thumb distance = pinch). Needs a
  webcam + network; falls back to pointer if unavailable.

## What's here
- `lib/interaction.js` — the pure interaction core (no DOM, no camera):
  one-euro fingertip smoothing, a **debounced** pinch state machine, and the
  grab/drag controller. This is the part that has to feel right.
- `index.html` — single-file surface: Canvas-2D glow + the hand source (pointer
  or MediaPipe), wired to the core.
- `test/interaction.test.js` — Node tests for smoothing, pinch debounce, and
  grab/drag.

## Verified
- `cd hologram && node --test` → **6 tests pass**.
- Headless (Playwright, pointer mode): grab → drag 233px → object tracks the
  cursor exactly → release, **0 console errors**.

## The lesson it enforces
The company's learning loop produced: *"every discrete gesture must debounce its
trigger edge."* `PinchDetector` implements it (hysteresis + a debounce window)
and `test/interaction.test.js` is the regression check — chatter at the threshold
never double-fires a grab.

## Next (backlog `../rory/brain/projects/hologram/backlog.md`)
Confirm MediaPipe fps on the owner's hardware (Milestone 1 on real camera),
holographic depth via three.js/WebGL (Milestone 7), reflector prototype (stretch),
rehearsal pass.

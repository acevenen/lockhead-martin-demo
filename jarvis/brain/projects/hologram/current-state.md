# Hologram — current state

**Phase:** spike landed. The interaction core is built and tested; a runnable
demo grabs and drags a glowing object with the fingertip (pointer today, camera
opt-in). See `../../../../hologram/` (`README.md`).

**Verified:** `hologram/test/interaction.test.js` (6 tests: smoothing, pinch
debounce, grab/drag) + a headless Playwright pass (grab → drag → release, 0
console errors). Milestones 1 (logic + camera hook), 4 (debounced pinch), 5
(drag), and 6 (smoothing) are demonstrated; Milestone 1 on a real webcam still
needs an fps check on the owner's hardware, and 7–9 (holographic depth, reflector,
rehearsal) remain.

## Hardware inventory questionnaire (owner to fill — do not assume)
| Item | Value |
|---|---|
| Computer to run the demo (model, OS) | unknown |
| GPU | unknown |
| Webcam (built-in / external, resolution, fps) | unknown |
| Display (size, brightness, resolution) | unknown |
| Clear acrylic / reflector on hand? | unknown |
| Dark enclosure / backdrop available? | unknown |
| Room lighting control at demo time? | unknown |

## What exists
- A validated CEO decomposition into 3 bounded tasks (see `backlog.md`).
- A verified lesson: discrete gestures must debounce their trigger edge.

## What's next
Milestone 1 — a real browser spike: `getUserMedia` + MediaPipe Hands rendering
landmarks at >15fps. See `backlog.md`.

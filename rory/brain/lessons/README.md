# Lessons

Curated, **verified** lessons live here as the human-readable record; the
operational copy (with enforcement state) lives in the `lessons` table and is
managed by `rory/os/learning/repository.js`.

## The rule
A lesson is not "verified" because an agent wrote it. It becomes `active` only
after a **passing regression check** or an explicit **reviewer approval**. It is
marked `superseded` when replaced, or `ineffective` if later evidence shows it
didn't prevent the failure.

## Structure of a lesson
trigger conditions · applicable scopes/tags/task-type · prevention instruction ·
enforcement mechanism · regression check · evidence · confidence · status ·
supersedes · last verified · owner.

## Retrieval into work
When a task is created, `LessonBook.relevant({ taskType, tags, scopes })` returns
the active lessons that apply, and only that subset is placed in the worker's
context — the brain does not dump every lesson into every task.

## Current lessons

### L-1 — Debounce every discrete gesture edge · **active**
- **Trigger:** gesture/edge detection without debouncing.
- **Scope/tags:** `project:hologram`, `frontend`, `gesture`.
- **Prevention:** every discrete gesture must debounce its trigger edge (add
  hysteresis + a hold window) so it can't double-fire.
- **Enforcement:** implemented in `hologram/lib/interaction.js` (`PinchDetector`).
- **Regression check:** `hologram/test/interaction.test.js` — "pinch debounces
  chatter — no double fire" (passing).
- **Status:** `active` — verified by a passing regression check (not just
  proposed). This is the loop working end to end: a mocked failure produced the
  lesson; a real test now enforces it.
- **Last verified:** 2026-08-01.

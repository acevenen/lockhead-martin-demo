# Lessons

Curated, **verified** lessons live here as the human-readable record; the
operational copy (with enforcement state) lives in the `lessons` table and is
managed by `jarvis/os/learning/repository.js`.

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
- _(none curated into this file yet)_ — the mocked run produces one example:
  *"Every discrete gesture must debounce its trigger edge; add a regression
  check."* Once a real gesture regression test exists and passes, promote it here.

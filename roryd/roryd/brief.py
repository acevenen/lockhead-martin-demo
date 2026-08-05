"""Building the brief the owner hears when the daemon comes up.

The brief answers three questions in the order a person actually asks them:

  1. What happened since I left?
  2. What is waiting on me?
  3. What is next?

It reads the same ``rory/state.json`` the HUD and the Claude Code agents use,
plus the daily improvement ledger, so the spoken brief and the screen can never
disagree. It never invents progress: a quiet day is reported as a quiet day.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

from .ledger import Entry, Ledger


@dataclass
class Brief:
    """Everything needed to speak or render the morning brief."""

    greeting: str = ""
    headline: str = ""
    since: str = ""
    done: list[str] = field(default_factory=list)
    blocked: list[str] = field(default_factory=list)
    decisions: list[str] = field(default_factory=list)
    yesterday: Entry | None = None
    streak: int = 0
    priority: str = ""
    priority_next: str = ""
    open_tasks: int = 0

    def to_dict(self) -> dict:
        return {
            "greeting": self.greeting,
            "headline": self.headline,
            "since": self.since,
            "done": self.done,
            "blocked": self.blocked,
            "decisions": self.decisions,
            "yesterday": self.yesterday.to_dict() if self.yesterday else None,
            "streak": self.streak,
            "priority": self.priority,
            "priority_next": self.priority_next,
            "open_tasks": self.open_tasks,
            "spoken": self.spoken(),
        }

    def spoken(self) -> str:
        """The brief as one short spoken passage.

        Deliberately compressed: a person listening does not want a list read
        out, they want the shape of it and then the one thing that needs them.
        """
        parts: list[str] = []
        if self.greeting:
            parts.append(self.greeting)

        if self.yesterday and self.yesterday.improvement:
            parts.append(f"Yesterday's improvement: {_clean(self.yesterday.improvement)}")
            if self.streak > 1:
                parts.append(f"That is {self.streak} days in a row.")
        elif self.headline:
            parts.append(_clean(self.headline))

        if self.done:
            n = len(self.done)
            parts.append(f"{n} item{'s' if n != 1 else ''} landed since you left.")

        if self.decisions:
            n = len(self.decisions)
            parts.append(
                f"{n} thing{'s' if n != 1 else ''} need{'' if n != 1 else 's'} your call. "
                f"First: {_clean(self.decisions[0])}"
            )
        elif self.blocked:
            parts.append(f"Blocked: {_clean(self.blocked[0])}")
        else:
            parts.append("Nothing is waiting on you.")

        if self.priority_next:
            parts.append(f"Next up: {_clean(self.priority_next)}")

        return " ".join(p.rstrip(".") + "." for p in parts if p.strip())

    def headline_line(self) -> str:
        """One line for a notification or the top of the HUD."""
        if self.decisions:
            return f"{len(self.done)} landed · {len(self.decisions)} need you"
        return f"{len(self.done)} landed · nothing waiting on you"


def _clean(text: str) -> str:
    return " ".join(str(text).split()).strip()


def time_greeting(now: datetime | None = None) -> str:
    hour = (now or datetime.now()).hour
    if hour < 5:
        return "Working late"
    if hour < 12:
        return "Good morning"
    if hour < 18:
        return "Good afternoon"
    return "Good evening"


def _read_state(path: Path) -> dict:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def build(
    state_file: Path,
    ledger_file: Path,
    honorific: str = "sir",
    now: datetime | None = None,
) -> Brief:
    """Assemble the brief from state and the ledger.

    Missing or malformed files degrade to an honest empty brief rather than
    raising, because the daemon must still come up and listen.
    """
    state = _read_state(state_file)
    ledger = Ledger(ledger_file)

    brief = Brief()
    brief.greeting = f"{time_greeting(now)}, {honorific}"

    raw_brief = state.get("brief") or {}
    brief.headline = _clean(raw_brief.get("headline", ""))
    brief.since = _clean(raw_brief.get("since", ""))

    for item in raw_brief.get("items", []) or []:
        if not isinstance(item, dict):
            continue
        text = _clean(item.get("text", ""))
        if not text:
            continue
        kind = str(item.get("kind", "")).lower()
        if kind == "done":
            brief.done.append(text)
        elif kind == "blocked":
            brief.blocked.append(text)

    for block in state.get("roadblocks", []) or []:
        if isinstance(block, dict) and block.get("needsUser"):
            title = _clean(block.get("title", ""))
            if title:
                brief.decisions.append(title)

    priorities = state.get("priorities") or []
    if priorities and isinstance(priorities[0], dict):
        brief.priority = _clean(priorities[0].get("label", ""))
        brief.priority_next = _clean(priorities[0].get("next", ""))

    brief.open_tasks = sum(
        1
        for t in (state.get("tasks") or [])
        if isinstance(t, dict) and str(t.get("status", "open")).lower() == "open"
    )

    brief.yesterday = _most_recent_prior(ledger, now)
    brief.streak = ledger.streak()
    return brief


def _most_recent_prior(ledger: Ledger, now: datetime | None) -> Entry | None:
    """The latest ledger entry from before today.

    The brief is about what happened while the owner was away, so today's own
    in-progress entry is not "yesterday's improvement".
    """
    today = (now or datetime.now()).date()
    prior = [e for e in ledger.read() if _as_date(e.date) and _as_date(e.date) < today]
    return prior[-1] if prior else ledger.latest()


def _as_date(value: str) -> date | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None

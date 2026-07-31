"""The daily improvement ledger.

The owner's standing instruction is that every working day must leave the
workspace better than it found it — not just busier. A list of things that were
done does not prove that, so the ledger requires each entry to name three
things explicitly:

  * ``improvement`` — what is materially better than yesterday
  * ``pain``        — the friction or problem it removes
  * ``shipped``     — what actually landed

An entry missing ``improvement`` or ``pain`` is invalid. That is the point: it
is impossible to close a day by recording activity alone, so the discipline is
enforced by the format rather than by remembering.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable


class LedgerError(ValueError):
    """Raised when an entry does not meet the daily-improvement bar."""


@dataclass
class Entry:
    """One working day."""

    date: str
    improvement: str
    pain: str
    shipped: list[str] = field(default_factory=list)
    agent: str = "jarvis-chief-of-staff"
    notes: str = ""

    def validate(self) -> None:
        """Reject an entry that records activity without progress."""
        if not _isodate(self.date):
            raise LedgerError(f"date {self.date!r} is not YYYY-MM-DD")
        if not self.improvement.strip():
            raise LedgerError(
                "every day must name an improvement — what is better than yesterday?"
            )
        if not self.pain.strip():
            raise LedgerError(
                "every improvement must name the pain it removes — who hurt less today?"
            )
        if not [s for s in self.shipped if s.strip()]:
            raise LedgerError("every day must list at least one thing that shipped")

    def to_dict(self) -> dict:
        return asdict(self)


def _isodate(value: str) -> bool:
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


class Ledger:
    """Append-only record of daily entries, newest last."""

    def __init__(self, path: Path):
        self.path = Path(path)

    def read(self) -> list[Entry]:
        if not self.path.exists():
            return []
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            # A corrupt ledger must not take the daemon down; the brief simply
            # reports that it has no history.
            return []
        entries: list[Entry] = []
        for item in raw.get("entries", []):
            if not isinstance(item, dict):
                continue
            entries.append(
                Entry(
                    date=str(item.get("date", "")),
                    improvement=str(item.get("improvement", "")),
                    pain=str(item.get("pain", "")),
                    shipped=[str(s) for s in item.get("shipped", [])],
                    agent=str(item.get("agent", "")),
                    notes=str(item.get("notes", "")),
                )
            )
        entries.sort(key=lambda e: e.date)
        return entries

    def append(self, entry: Entry) -> None:
        """Validate and record one day, replacing any existing entry for it."""
        entry.validate()
        entries = [e for e in self.read() if e.date != entry.date]
        entries.append(entry)
        entries.sort(key=lambda e: e.date)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "note": (
                "Daily improvement ledger. Every entry must name an improvement "
                "and the pain it removes — recording activity alone is not a day."
            ),
            "entries": [e.to_dict() for e in entries],
        }
        self.path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    def latest(self) -> Entry | None:
        entries = self.read()
        return entries[-1] if entries else None

    def since(self, days: int) -> list[Entry]:
        """Entries from the last ``days`` days, oldest first."""
        cutoff = date.today() - timedelta(days=max(0, days))
        out = []
        for entry in self.read():
            try:
                when = datetime.strptime(entry.date, "%Y-%m-%d").date()
            except ValueError:
                continue
            if when >= cutoff:
                out.append(entry)
        return out

    def streak(self) -> int:
        """Consecutive days ending today or yesterday that recorded progress.

        Counting back from yesterday as well as today means the streak is not
        reported as broken simply because the day is not finished yet.
        """
        dates = set()
        for entry in self.read():
            try:
                dates.add(datetime.strptime(entry.date, "%Y-%m-%d").date())
            except ValueError:
                continue
        if not dates:
            return 0
        today = date.today()
        cursor = today if today in dates else today - timedelta(days=1)
        count = 0
        while cursor in dates:
            count += 1
            cursor -= timedelta(days=1)
        return count


def improvements(entries: Iterable[Entry]) -> list[str]:
    """Just the improvement lines, for a spoken summary."""
    return [e.improvement.strip() for e in entries if e.improvement.strip()]

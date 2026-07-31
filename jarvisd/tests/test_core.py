"""Tests for the parts of the daemon that do not need a microphone.

Wake-word capture and speech synthesis need real audio hardware and are
verified by hand on the target machine; everything below is pure logic and is
covered here.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest

from jarvisd import brief as brief_mod
from jarvisd import intents
from jarvisd.ledger import Entry, Ledger, LedgerError


# --------------------------------------------------------------------------
# Intent routing
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "utterance,expected",
    [
        ("brief me", "brief"),
        ("hey jarvis brief me", "brief"),
        ("Hey Jarvis, uh, brief me", "brief"),
        ("what did i miss", "brief"),
        ("catch me up", "brief"),
        ("status report", "status"),
        ("what did you do yesterday", "yesterday"),
        ("what's my streak", "streak"),
        ("open sentinel", "sentinel"),
        ("show me the tasks", "tasks"),
        ("any roadblocks", "ops"),
        ("show demos", "demos"),
        ("who is on the team", "agents"),
        ("help", "help"),
        ("what time is it", "time"),
        ("mute", "mute"),
        ("goodnight", "sleep"),
        ("thanks", "thanks"),
        ("hello", "greet"),
    ],
)
def test_route_resolves_known_commands(utterance, expected):
    assert intents.route(utterance).name == expected


def test_route_tolerates_transcription_errors_of_the_wake_word():
    # Whisper mishears "Jarvis" constantly; the assistant must not feel broken
    # because of it.
    for spelling in ["jarvis", "jarvi", "travis", "charvis"]:
        got = intents.route(f"hey {spelling} open sentinel")
        assert got.name == "sentinel", f"{spelling!r} -> {got.name}"


def test_route_handles_misheard_sentinel():
    for spelling in ["sentinel", "sentinal", "centinel"]:
        assert intents.route(f"open {spelling}").name == "sentinel"


def test_route_unknown_is_honest_and_offers_help():
    got = intents.route("banana hovercraft")
    assert got.name == "unknown"
    assert got.panel == "help"
    assert got.say


def test_route_empty_utterance():
    assert intents.route("").name == "empty"
    assert intents.route("   ").name == "empty"
    # A bare wake word with nothing after it is empty, not a command.
    assert intents.route("hey jarvis").name == "empty"


def test_normalize_strips_wake_word_and_filler():
    assert intents.normalize("Hey Jarvis, um, show tasks") == "show tasks"
    assert intents.normalize("jarvis brief me") == "brief me"
    assert intents.normalize("brief me") == "brief me"


def test_describe_is_populated():
    ref = intents.describe()
    assert ref and all(len(row) == 2 and row[0] and row[1] for row in ref)


# --------------------------------------------------------------------------
# The daily improvement ledger
# --------------------------------------------------------------------------

def _entry(day: str, **kw) -> Entry:
    base = dict(
        improvement="Spotter now collapses duplicate remediation advice",
        pain="the plan repeated the same fix three times and people stopped reading it",
        shipped=["spotter plan dedup"],
    )
    base.update(kw)
    return Entry(date=day, **base)


def test_ledger_requires_an_improvement(tmp_path):
    led = Ledger(tmp_path / "ledger.json")
    with pytest.raises(LedgerError, match="improvement"):
        led.append(_entry("2026-07-28", improvement="   "))


def test_ledger_requires_the_pain_it_removes(tmp_path):
    led = Ledger(tmp_path / "ledger.json")
    with pytest.raises(LedgerError, match="pain"):
        led.append(_entry("2026-07-28", pain=""))


def test_ledger_requires_something_shipped(tmp_path):
    led = Ledger(tmp_path / "ledger.json")
    with pytest.raises(LedgerError, match="shipped"):
        led.append(_entry("2026-07-28", shipped=[]))


def test_ledger_rejects_a_bad_date(tmp_path):
    led = Ledger(tmp_path / "ledger.json")
    with pytest.raises(LedgerError, match="YYYY-MM-DD"):
        led.append(_entry("July 28"))


def test_ledger_roundtrips_and_sorts(tmp_path):
    led = Ledger(tmp_path / "ledger.json")
    led.append(_entry("2026-07-27"))
    led.append(_entry("2026-07-25"))
    got = led.read()
    assert [e.date for e in got] == ["2026-07-25", "2026-07-27"]
    assert led.latest().date == "2026-07-27"


def test_ledger_replaces_same_day_rather_than_duplicating(tmp_path):
    led = Ledger(tmp_path / "ledger.json")
    led.append(_entry("2026-07-28", improvement="first"))
    led.append(_entry("2026-07-28", improvement="second"))
    entries = led.read()
    assert len(entries) == 1
    assert entries[0].improvement == "second"


def test_ledger_missing_file_is_empty_not_an_error(tmp_path):
    led = Ledger(tmp_path / "nope.json")
    assert led.read() == []
    assert led.latest() is None
    assert led.streak() == 0


def test_ledger_corrupt_file_degrades_quietly(tmp_path):
    # A broken ledger must not stop the daemon from coming up and listening.
    path = tmp_path / "ledger.json"
    path.write_text("{ not json", encoding="utf-8")
    assert Ledger(path).read() == []


def test_streak_counts_consecutive_days(tmp_path):
    led = Ledger(tmp_path / "ledger.json")
    today = date.today()
    for offset in range(3):
        led.append(_entry((today - timedelta(days=offset)).isoformat()))
    assert led.streak() == 3


def test_streak_survives_an_unfinished_today(tmp_path):
    # Yesterday and the day before are recorded but today is still in progress;
    # the streak is not broken yet.
    led = Ledger(tmp_path / "ledger.json")
    today = date.today()
    led.append(_entry((today - timedelta(days=1)).isoformat()))
    led.append(_entry((today - timedelta(days=2)).isoformat()))
    assert led.streak() == 2


def test_streak_breaks_on_a_gap(tmp_path):
    led = Ledger(tmp_path / "ledger.json")
    today = date.today()
    led.append(_entry(today.isoformat()))
    led.append(_entry((today - timedelta(days=5)).isoformat()))
    assert led.streak() == 1


# --------------------------------------------------------------------------
# The brief
# --------------------------------------------------------------------------

STATE = {
    "brief": {
        "since": "last session",
        "headline": "Spotter shipped.",
        "items": [
            {"kind": "done", "text": "Shipped Spotter device intelligence"},
            {"kind": "done", "text": "Closed an authz scope gap"},
            {"kind": "blocked", "text": "Waiting on a milestone decision"},
        ],
    },
    "priorities": [{"label": "SENTINEL DEVELOPMENT", "next": "Spotter v2 probe"}],
    "tasks": [{"status": "open"}, {"status": "open"}, {"status": "in-review"}],
    "roadblocks": [
        {"title": "Sentinel next milestone needs direction", "needsUser": True},
        {"title": "Handled internally", "needsUser": False},
    ],
}


def _write_state(tmp_path: Path) -> Path:
    p = tmp_path / "state.json"
    p.write_text(json.dumps(STATE), encoding="utf-8")
    return p


def test_brief_reads_state(tmp_path):
    b = brief_mod.build(_write_state(tmp_path), tmp_path / "ledger.json")
    assert len(b.done) == 2
    assert len(b.blocked) == 1
    assert b.decisions == ["Sentinel next milestone needs direction"]
    assert b.open_tasks == 2
    assert b.priority == "SENTINEL DEVELOPMENT"


def test_brief_spoken_form_is_a_short_passage(tmp_path):
    b = brief_mod.build(_write_state(tmp_path), tmp_path / "ledger.json", honorific="sir")
    spoken = b.spoken()
    assert "sir" in spoken
    assert "2 items landed" in spoken
    assert "need" in spoken  # surfaces the decision waiting on the owner
    # It is meant to be heard, not read: keep it tight.
    assert len(spoken) < 600


def test_brief_leads_with_yesterdays_improvement(tmp_path):
    led = Ledger(tmp_path / "ledger.json")
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    led.append(
        Entry(
            date=yesterday,
            improvement="Spotter stopped giving advice for a state you are not in",
            pain="a LAN-only camera was told to undo an internet exposure it never had",
            shipped=["relevance filter"],
        )
    )
    b = brief_mod.build(_write_state(tmp_path), tmp_path / "ledger.json")
    assert b.yesterday is not None
    assert "Yesterday's improvement" in b.spoken()
    assert "state you are not in" in b.spoken()


def test_brief_excludes_todays_own_entry_from_yesterday(tmp_path):
    # Today's in-progress entry is not "what happened while you were away".
    led = Ledger(tmp_path / "ledger.json")
    led.append(Entry(date=(date.today() - timedelta(days=2)).isoformat(),
                     improvement="older", pain="p", shipped=["s"]))
    led.append(Entry(date=date.today().isoformat(),
                     improvement="today only", pain="p", shipped=["s"]))
    b = brief_mod.build(_write_state(tmp_path), tmp_path / "ledger.json")
    assert b.yesterday.improvement == "older"


def test_brief_reports_a_quiet_day_honestly(tmp_path):
    empty = tmp_path / "empty.json"
    empty.write_text(json.dumps({"brief": {"items": []}}), encoding="utf-8")
    b = brief_mod.build(empty, tmp_path / "ledger.json")
    spoken = b.spoken()
    assert "Nothing is waiting on you" in spoken
    assert "0 items landed" in spoken or "landed" not in spoken


def test_brief_survives_missing_state_file(tmp_path):
    b = brief_mod.build(tmp_path / "does-not-exist.json", tmp_path / "ledger.json")
    assert b.spoken()  # still greets, still says nothing is waiting
    assert b.done == []


def test_brief_survives_corrupt_state_file(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text("{{{", encoding="utf-8")
    b = brief_mod.build(bad, tmp_path / "ledger.json")
    assert b.done == []
    assert b.spoken()


def test_brief_serializes_for_the_hud(tmp_path):
    b = brief_mod.build(_write_state(tmp_path), tmp_path / "ledger.json")
    payload = b.to_dict()
    assert json.dumps(payload)  # must be JSON-serializable for the HUD
    for key in ["greeting", "headline", "done", "decisions", "spoken", "streak"]:
        assert key in payload


@pytest.mark.parametrize(
    "hour,expected",
    [(2, "Working late"), (9, "Good morning"), (14, "Good afternoon"), (21, "Good evening")],
)
def test_time_greeting(hour, expected):
    assert brief_mod.time_greeting(datetime(2026, 7, 28, hour, 0)) == expected

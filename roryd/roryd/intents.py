"""Turning a spoken phrase into an action.

The vocabulary deliberately mirrors the browser HUD's router, so anything the
owner can say to the glasses or type into the command line means the same thing
here. Matching is intentionally forgiving: speech-to-text output is messy, and
refusing a command because the transcript said "sentinal" would make the
assistant feel broken.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable


@dataclass
class Intent:
    """A resolved command."""

    name: str
    say: str = ""
    panel: str = ""
    action: str = ""
    args: dict = field(default_factory=dict)


# Each rule is (intent name, pattern, optional panel to surface on the HUD).
# Order matters: the first match wins, so narrow patterns precede broad ones.
_RULES: list[tuple[str, str, str]] = [
    ("brief",      r"\b(brief|briefing|what did i miss|what.*happen|catch me up|morning report)\b", "brief"),
    ("status",     r"\b(status|sitrep|situation report|report)\b", "brief"),
    ("yesterday",  r"\b(yesterday|last (session|day)|what did you do)\b", "brief"),
    ("streak",     r"\b(streak|how many days|progress)\b", "brief"),
    ("sentinel",   r"\b(sentinel|sentinal|centinel|priority one)\b", "sentinel"),
    ("spotter",    r"\b(spotter|scan (this|that|the) device|what is this device)\b", "sentinel"),
    ("tasks",      r"\b(task|tasks|to.?do|board|projects?)\b", "tasks"),
    ("ops",        r"\b(roadblocks?|blockers?|operations|problems?|issues?)\b", "ops"),
    ("demos",      r"\b(demo|demos|aegis|overwatch)\b", "demos"),
    ("agents",     r"\b(agents?|roster|team)\b", "agents"),
    ("help",       r"\b(help|commands?|what can you do)\b", "help"),
    ("time",       r"\b(time|date|what day)\b", ""),
    ("mute",       r"\b(mute|quiet|silence|shut up|be quiet)\b", ""),
    ("unmute",     r"\b(unmute|speak up|voice on)\b", ""),
    ("sleep",      r"\b(go to sleep|stand down|goodnight|good night|dismissed|that.?s all)\b", ""),
    ("stop",       r"\b(stop|cancel|never mind|nevermind)\b", ""),
    ("thanks",     r"\b(thank you|thanks|cheers|appreciate it)\b", ""),
    ("greet",      r"\b(hello|hey|hi|you there|you awake|wake up)\b", ""),
]

_COMPILED = [(name, re.compile(pattern, re.I), panel) for name, pattern, panel in _RULES]

# Filler the wake word tends to drag in, stripped before matching so
# "hey jarvis, uh, brief me" resolves cleanly.
_FILLER = re.compile(
    r"^\s*(hey\s+)?(jarvis|jarvi|rory|travis|charvis|service)?[\s,\.]*(um+|uh+|so|ok(ay)?|please)?[\s,\.]*",
    re.I,
)


def normalize(utterance: str) -> str:
    """Strip the wake word and leading filler from a transcript."""
    text = " ".join(str(utterance or "").split())
    return _FILLER.sub("", text, count=1).strip()


def route(utterance: str) -> Intent:
    """Resolve a spoken phrase to an intent.

    An unrecognized phrase resolves to the ``unknown`` intent rather than
    raising or guessing, and surfaces the command reference.
    """
    text = normalize(utterance)
    if not text:
        return Intent(name="empty", say="I did not catch that.")

    for name, pattern, panel in _COMPILED:
        if pattern.search(text):
            return Intent(name=name, panel=panel, args={"utterance": text})

    return Intent(
        name="unknown",
        panel="help",
        say="I did not catch a command in that. Say \"help\" for what I know.",
        args={"utterance": text},
    )


Responder = Callable[[Intent], str]


def describe() -> list[tuple[str, str]]:
    """The command reference, for the help intent and the docs."""
    return [
        ("hey jarvis, brief me", "what happened since you left"),
        ("status report", "one-breath sitrep"),
        ("what did you do yesterday", "yesterday's improvement and what shipped"),
        ("what's my streak", "consecutive days of recorded progress"),
        ("open sentinel", "Priority One"),
        ("show tasks", "the task board"),
        ("any roadblocks", "what needs your call"),
        ("show demos", "the demo bay"),
        ("agents", "the roster"),
        ("help", "this list"),
        ("mute / unmute", "voice output"),
        ("goodnight", "stand down and keep listening for the wake word"),
    ]

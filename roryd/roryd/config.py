"""Configuration and filesystem layout for the RORY daemon.

Everything resolves from the repository root so the daemon, the HUD, and the
Claude Code agents all read and write the same files. Secrets are read from the
environment only and are never written to disk by this package.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _repo_root() -> Path:
    """Locate the repository root from this file's position on disk.

    roryd/roryd/config.py -> repo root is two levels up. An explicit
    RORY_HOME wins, so the daemon can run from an install location that is
    not inside the checkout.
    """
    override = os.environ.get("RORY_HOME", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Config:
    """Resolved runtime configuration."""

    root: Path = field(default_factory=_repo_root)

    # Wake word. openWakeWord ships a pretrained "hey_jarvis" model, so the
    # phrase the owner actually wants needs no training step.
    wake_model: str = "hey_jarvis"
    wake_threshold: float = 0.5

    # How long to keep capturing after the wake word fires, and how much
    # trailing silence ends the utterance.
    command_seconds: float = 6.0
    silence_seconds: float = 1.1

    sample_rate: int = 16000
    frame_size: int = 1280  # 80 ms at 16 kHz, openWakeWord's expected chunk

    # Local speech-to-text. "base.en" is the accuracy/latency sweet spot for
    # short commands on CPU.
    stt_model: str = "base.en"

    # Voice out. Without an ElevenLabs key the daemon uses the system voice,
    # so it is never a hard dependency.
    eleven_voice: str = "onwK4e9ZLuTAKqWW03F9"

    http_port: int = 8791
    open_hud_on_start: bool = True

    @property
    def state_file(self) -> Path:
        return self.root / "rory" / "state.json"

    @property
    def ledger_file(self) -> Path:
        return self.root / "rory" / "ledger.json"

    @property
    def hud_file(self) -> Path:
        return self.root / "rory" / "index.html"

    @property
    def log_file(self) -> Path:
        return self.log_dir / "roryd.log"

    @property
    def log_dir(self) -> Path:
        override = os.environ.get("RORY_LOG_DIR", "").strip()
        if override:
            return Path(override).expanduser()
        # Keep logs out of the repo so they are never committed.
        if os.name == "nt":
            base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
            return base / "roryd"
        return Path.home() / ".local" / "state" / "roryd"

    @property
    def eleven_key(self) -> str:
        """ElevenLabs key, environment-only. Never persisted by this package."""
        return os.environ.get("ELEVENLABS_API_KEY", "").strip()

    @property
    def honorific(self) -> str:
        return os.environ.get("RORY_HONORIFIC", "sir").strip() or "sir"


def load() -> Config:
    """Build the configuration, applying environment overrides."""
    cfg = Config()

    def _float(name: str, current: float) -> float:
        raw = os.environ.get(name, "").strip()
        if not raw:
            return current
        try:
            return float(raw)
        except ValueError:
            return current

    def _int(name: str, current: int) -> int:
        raw = os.environ.get(name, "").strip()
        if not raw:
            return current
        try:
            return int(raw)
        except ValueError:
            return current

    return Config(
        root=cfg.root,
        wake_model=os.environ.get("RORY_WAKE_MODEL", cfg.wake_model).strip() or cfg.wake_model,
        wake_threshold=_float("RORY_WAKE_THRESHOLD", cfg.wake_threshold),
        command_seconds=_float("RORY_COMMAND_SECONDS", cfg.command_seconds),
        silence_seconds=_float("RORY_SILENCE_SECONDS", cfg.silence_seconds),
        sample_rate=cfg.sample_rate,
        frame_size=cfg.frame_size,
        stt_model=os.environ.get("RORY_STT_MODEL", cfg.stt_model).strip() or cfg.stt_model,
        eleven_voice=os.environ.get("RORY_VOICE_ID", cfg.eleven_voice).strip() or cfg.eleven_voice,
        http_port=_int("RORY_HTTP_PORT", cfg.http_port),
        open_hud_on_start=os.environ.get("RORY_OPEN_HUD", "1").strip() != "0",
    )

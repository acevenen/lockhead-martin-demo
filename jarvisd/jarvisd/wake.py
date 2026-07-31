"""Always-on wake-word detection for "Hey Jarvis".

openWakeWord ships a pretrained ``hey_jarvis`` model, so the phrase the owner
actually wants needs no training step and no cloud service. Detection runs on
the CPU against a live 16 kHz stream and is cheap enough to leave running.

As everywhere else in the daemon, a missing dependency disables the feature
rather than stopping the process.
"""

from __future__ import annotations

import logging
import time

log = logging.getLogger("jarvisd.wake")


class WakeWord:
    """Detects the wake phrase in a stream of 16-bit PCM frames."""

    def __init__(self, model: str = "hey_jarvis", threshold: float = 0.5,
                 refractory_seconds: float = 2.0):
        self.model_name = model
        self.threshold = threshold
        self.refractory_seconds = refractory_seconds
        self._model = None
        self._last_fired = 0.0
        try:
            import openwakeword  # noqa: F401
            self._available = True
        except ImportError:
            log.warning("openwakeword not installed; wake word disabled")
            self._available = False

    @property
    def available(self) -> bool:
        return self._available

    def load(self) -> bool:  # pragma: no cover - downloads a model
        """Load the pretrained model, downloading it on first run."""
        if not self._available:
            return False
        try:
            from openwakeword.model import Model
            from openwakeword import utils

            try:
                self._model = Model(wakeword_models=[self.model_name])
            except Exception:
                # First run: the pretrained models are release assets and are
                # fetched on demand.
                log.info("downloading wake-word model %s", self.model_name)
                utils.download_models([f"{self.model_name}_v0.1"])
                self._model = Model(wakeword_models=[self.model_name])
            return True
        except Exception as exc:
            log.error("could not load wake-word model: %s", exc)
            self._available = False
            return False

    def detect(self, frame: bytes) -> float:  # pragma: no cover - needs model
        """Score one frame. Returns the wake-word confidence in [0, 1]."""
        if self._model is None:
            return 0.0
        import numpy as np

        audio = np.frombuffer(frame, dtype=np.int16)
        scores = self._model.predict(audio)
        # The model dict is keyed by model name; take the best score present so
        # a version suffix in the key does not silently return zero.
        return max(scores.values()) if scores else 0.0

    def fired(self, frame: bytes) -> bool:  # pragma: no cover - needs model
        """True when the wake word just fired, with a refractory period.

        Without the refractory window a single utterance of "Hey Jarvis" spans
        several frames above threshold and would trigger repeatedly.
        """
        score = self.detect(frame)
        if score < self.threshold:
            return False
        now = time.monotonic()
        if now - self._last_fired < self.refractory_seconds:
            return False
        self._last_fired = now
        log.info("wake word fired (%.2f)", score)
        return True

    def reset(self) -> None:  # pragma: no cover - needs model
        """Clear model state after handling a command."""
        if self._model is not None and hasattr(self._model, "reset"):
            self._model.reset()

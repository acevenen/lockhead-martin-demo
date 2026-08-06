"""Voice in and voice out.

Every capability here is optional. The daemon must still come up, serve the
brief, and accept typed commands on a machine with no microphone, no speakers,
and none of the optional packages installed — so each backend is probed at
construction and the daemon degrades instead of crashing.
"""

from __future__ import annotations

import logging
import os
import queue
import shutil
import subprocess
import sys
import threading
import wave
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

log = logging.getLogger("roryd.speech")


# --------------------------------------------------------------------------
# Voice out
# --------------------------------------------------------------------------

class Voice:
    """Speaks text, using the best backend available on this machine.

    Order of preference:
      1. ElevenLabs, when ELEVENLABS_API_KEY is set — the cinematic voice.
      2. The operating system's built-in speech, which needs no install.
      3. Silence, with the line logged, so the daemon still works headless.
    """

    def __init__(self, api_key: str = "", voice_id: str = "", muted: bool = False):
        self.api_key = api_key
        self.voice_id = voice_id
        self.muted = muted
        self._lock = threading.Lock()
        self._backend = self._choose_backend()
        log.info("voice backend: %s", self._backend)

    def _choose_backend(self) -> str:
        if self.api_key:
            try:
                import requests  # noqa: F401
                return "elevenlabs"
            except ImportError:
                log.warning("ELEVENLABS_API_KEY set but `requests` is missing; using system voice")
        if sys.platform == "darwin" and shutil.which("say"):
            return "say"
        if os.name == "nt":
            return "sapi"
        if shutil.which("espeak-ng") or shutil.which("espeak"):
            return "espeak"
        try:
            import pyttsx3  # noqa: F401
            return "pyttsx3"
        except ImportError:
            pass
        return "none"

    @property
    def available(self) -> bool:
        return self._backend != "none"

    def say(self, text: str) -> None:
        """Speak one line. Never raises — a failed utterance is logged."""
        text = " ".join(str(text or "").split())
        if not text:
            return
        log.info("say: %s", text)
        if self.muted or self._backend == "none":
            return
        with self._lock:
            try:
                getattr(self, f"_say_{self._backend}")(text)
            except Exception as exc:  # pragma: no cover - hardware dependent
                log.warning("speech failed via %s: %s", self._backend, exc)

    # -- backends ----------------------------------------------------------

    def _say_elevenlabs(self, text: str) -> None:  # pragma: no cover - network
        import requests

        resp = requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{self.voice_id}",
            headers={"xi-api-key": self.api_key, "Content-Type": "application/json"},
            json={
                "text": text,
                "model_id": "eleven_turbo_v2_5",
                "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.25},
            },
            timeout=30,
        )
        resp.raise_for_status()
        _play_mp3(resp.content)

    def _say_say(self, text: str) -> None:  # pragma: no cover - hardware
        subprocess.run(["say", "-v", "Daniel", text], check=False)

    def _say_sapi(self, text: str) -> None:  # pragma: no cover - hardware
        # PowerShell's built-in synthesizer avoids any Python dependency on
        # Windows. -Command is quoted carefully: the text is passed as a
        # single-quoted PowerShell literal with internal quotes doubled.
        safe = text.replace("'", "''")
        subprocess.run(
            [
                "powershell", "-NoProfile", "-NonInteractive", "-Command",
                "Add-Type -AssemblyName System.Speech; "
                "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                f"$s.Speak('{safe}')",
            ],
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )

    def _say_espeak(self, text: str) -> None:  # pragma: no cover - hardware
        binary = shutil.which("espeak-ng") or shutil.which("espeak")
        subprocess.run([binary, "-v", "en-gb", text], check=False)

    def _say_pyttsx3(self, text: str) -> None:  # pragma: no cover - hardware
        import pyttsx3

        engine = pyttsx3.init()
        engine.say(text)
        engine.runAndWait()


def _play_mp3(data: bytes) -> None:  # pragma: no cover - hardware
    """Play MP3 bytes with whatever the platform provides."""
    if os.name == "nt":
        tmp = Path(os.environ.get("TEMP", ".")) / "roryd_tts.mp3"
        tmp.write_bytes(data)
        subprocess.run(
            ["powershell", "-NoProfile", "-c",
             f"(New-Object Media.SoundPlayer).Load(); Start-Process -Wait '{tmp}'"],
            check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return
    for player in ("mpv", "ffplay", "afplay", "mpg123"):
        binary = shutil.which(player)
        if not binary:
            continue
        args = [binary, "-"]
        if player == "ffplay":
            args = [binary, "-nodisp", "-autoexit", "-loglevel", "quiet", "-"]
        subprocess.run(args, input=data, check=False)
        return
    log.warning("no audio player found for ElevenLabs output")


# --------------------------------------------------------------------------
# Voice in
# --------------------------------------------------------------------------

@dataclass
class Transcript:
    text: str
    confidence: float = 0.0


class Ears:
    """Speech-to-text for a short command utterance.

    Uses faster-whisper locally when installed. With nothing installed, the
    daemon falls back to typed commands rather than pretending to listen.
    """

    def __init__(self, model_name: str = "base.en"):
        self.model_name = model_name
        self._model = None
        self._backend = "none"
        try:
            from faster_whisper import WhisperModel  # noqa: F401
            self._backend = "faster-whisper"
        except ImportError:
            log.warning("faster-whisper not installed; speech-to-text disabled")

    @property
    def available(self) -> bool:
        return self._backend != "none"

    def _ensure_model(self):  # pragma: no cover - heavy import
        if self._model is None:
            from faster_whisper import WhisperModel

            # int8 on CPU is the practical choice for a background process that
            # must not fight the rest of the machine for resources.
            self._model = WhisperModel(self.model_name, device="cpu", compute_type="int8")
        return self._model

    def transcribe(self, pcm: bytes, sample_rate: int = 16000) -> Transcript:
        """Transcribe 16-bit mono PCM. Returns empty text when unavailable."""
        if not self.available or not pcm:
            return Transcript(text="")
        try:  # pragma: no cover - heavy
            model = self._ensure_model()
            buf = BytesIO()
            with wave.open(buf, "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(sample_rate)
                wav.writeframes(pcm)
            buf.seek(0)
            segments, _ = model.transcribe(buf, language="en", vad_filter=True)
            text = " ".join(seg.text.strip() for seg in segments).strip()
            return Transcript(text=text, confidence=1.0 if text else 0.0)
        except Exception as exc:  # pragma: no cover - hardware dependent
            log.warning("transcription failed: %s", exc)
            return Transcript(text="")


class Microphone:
    """A 16 kHz mono capture stream, yielding fixed-size frames.

    Wraps sounddevice so the rest of the daemon never imports it directly and
    so its absence is a soft failure.
    """

    def __init__(self, sample_rate: int = 16000, frame_size: int = 1280):
        self.sample_rate = sample_rate
        self.frame_size = frame_size
        self._queue: queue.Queue[bytes] = queue.Queue(maxsize=64)
        self._stream = None
        try:
            import sounddevice  # noqa: F401
            self._available = True
        except Exception:  # ImportError, or PortAudio missing at the OS level
            log.warning("sounddevice/PortAudio unavailable; microphone disabled")
            self._available = False

    @property
    def available(self) -> bool:
        return self._available

    def __enter__(self):  # pragma: no cover - hardware
        if not self._available:
            return self
        import sounddevice as sd

        def callback(indata, _frames, _time, status):
            if status:
                log.debug("audio status: %s", status)
            try:
                self._queue.put_nowait(bytes(indata))
            except queue.Full:
                # Dropping a frame is correct here: a backlogged queue means we
                # are behind, and stale audio is worse than a gap.
                pass

        self._stream = sd.RawInputStream(
            samplerate=self.sample_rate,
            blocksize=self.frame_size,
            dtype="int16",
            channels=1,
            callback=callback,
        )
        self._stream.start()
        return self

    def __exit__(self, *exc):  # pragma: no cover - hardware
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None
        return False

    def frames(self, timeout: float = 1.0):  # pragma: no cover - hardware
        """Yield captured frames until the stream is closed."""
        while self._stream is not None:
            try:
                yield self._queue.get(timeout=timeout)
            except queue.Empty:
                continue

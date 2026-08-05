"""The RORY daemon.

Runs in the background from login, keeps the brief current, listens for
"Hey Jarvis", and answers. It is built to survive a machine that is missing
every optional dependency: with no microphone it still serves the brief and
accepts typed commands, and it says so plainly rather than pretending to
listen.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import brief as brief_mod
from . import intents
from .config import Config, load as load_config
from .ledger import Ledger
from .speech import Ears, Microphone, Voice
from .wake import WakeWord

log = logging.getLogger("roryd")


def setup_logging(cfg: Config, verbose: bool = False) -> None:
    cfg.log_dir.mkdir(parents=True, exist_ok=True)
    handlers: list[logging.Handler] = [logging.FileHandler(cfg.log_file, encoding="utf-8")]
    if sys.stderr and sys.stderr.isatty():
        handlers.append(logging.StreamHandler(sys.stderr))
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        handlers=handlers,
        force=True,
    )


class Rory:
    """Ties the brief, the intent router, and the voice loop together."""

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.voice = Voice(api_key=cfg.eleven_key, voice_id=cfg.eleven_voice)
        self.ears = Ears(model_name=cfg.stt_model)
        self.wake = WakeWord(model=cfg.wake_model, threshold=cfg.wake_threshold)
        self.ledger = Ledger(cfg.ledger_file)
        self.brief = self.refresh_brief()
        self._stop = threading.Event()

    # -- brief -------------------------------------------------------------

    def refresh_brief(self) -> brief_mod.Brief:
        """Rebuild the brief from the current state and ledger."""
        self.brief = brief_mod.build(
            self.cfg.state_file, self.cfg.ledger_file, honorific=self.cfg.honorific
        )
        return self.brief

    def greet(self) -> None:
        """What the owner hears the moment the daemon comes up."""
        self.refresh_brief()
        self.voice.say(self.brief.spoken())
        if not self.wake.available or not Microphone().available:
            self.voice.say("Voice input is not available on this machine. Type your commands instead.")

    # -- intents -----------------------------------------------------------

    def respond(self, utterance: str) -> str:
        """Route an utterance and produce the spoken reply."""
        intent = intents.route(utterance)
        reply = self._reply_for(intent)
        if reply:
            self.voice.say(reply)
        return reply

    def _reply_for(self, intent: intents.Intent) -> str:
        b = self.refresh_brief()
        name = intent.name
        who = self.cfg.honorific

        if name in ("brief", "status"):
            return b.spoken()

        if name == "yesterday":
            if b.yesterday:
                imp = b.yesterday.improvement.rstrip(". ")
                pain = b.yesterday.pain.rstrip(". ")
                return f"Yesterday: {imp}. That removed this pain: {pain}."
            return "I have no record of yesterday yet."

        if name == "streak":
            streak = self.ledger.streak()
            if streak == 0:
                return "No streak yet. Today can start one."
            return f"{streak} day{'s' if streak != 1 else ''} in a row with a recorded improvement."

        if name == "sentinel":
            return f"Sentinel is priority one, {who}. {b.priority_next}" if b.priority_next else \
                   f"Sentinel is priority one, {who}."

        if name == "tasks":
            return f"{b.open_tasks} open task{'s' if b.open_tasks != 1 else ''} on the board."

        if name == "ops":
            if not b.decisions:
                return "Nothing needs your call right now."
            first = b.decisions[0]
            n = len(b.decisions)
            return f"{n} thing{'s' if n != 1 else ''} need your call. First: {first}"

        if name == "demos":
            return "Demo bay is on screen."

        if name == "agents":
            return "The roster is on screen."

        if name == "help":
            lines = ", ".join(phrase for phrase, _ in intents.describe()[:5])
            return f"Try: {lines}."

        if name == "time":
            now = time.localtime()
            return time.strftime("It is %I:%M %p on %A, %B %d.", now).replace(" 0", " ")

        if name == "mute":
            self.voice.muted = True
            return ""

        if name == "unmute":
            self.voice.muted = False
            return "Voice restored."

        if name == "sleep":
            return f"Standing by, {who}. Say hey Jarvis when you need me."

        if name == "stop":
            return ""

        if name == "thanks":
            return f"Always, {who}."

        if name == "greet":
            return f"I'm here, {who}."

        if name == "empty":
            return "I did not catch that."

        return intent.say or "I did not catch a command in that."

    # -- voice loop --------------------------------------------------------

    def listen_forever(self) -> None:  # pragma: no cover - hardware
        """Block on the microphone, waking on the wake word."""
        mic = Microphone(self.cfg.sample_rate, self.cfg.frame_size)
        if not (mic.available and self.wake.available and self.wake.load()):
            log.warning("voice loop unavailable; running in text mode")
            self.text_mode()
            return

        log.info("listening for %r", self.cfg.wake_model)
        with mic:
            for frame in mic.frames():
                if self._stop.is_set():
                    return
                if not self.wake.fired(frame):
                    continue
                self.wake.reset()
                self._handle_wake(mic)

    def _handle_wake(self, mic: Microphone) -> None:  # pragma: no cover - hardware
        """Capture one command after the wake word and answer it."""
        self.voice.say("Yes?")
        pcm = self._capture_utterance(mic)
        if not pcm:
            return
        transcript = self.ears.transcribe(pcm, self.cfg.sample_rate)
        if not transcript.text:
            self.voice.say("I did not catch that.")
            return
        log.info("heard: %s", transcript.text)
        self.respond(transcript.text)

    def _capture_utterance(self, mic: Microphone) -> bytes:  # pragma: no cover - hardware
        """Record until the speaker stops or the window closes."""
        import audioop

        chunks: list[bytes] = []
        started = time.monotonic()
        quiet_for = 0.0
        frame_seconds = self.cfg.frame_size / self.cfg.sample_rate

        for frame in mic.frames(timeout=0.5):
            chunks.append(frame)
            if audioop.rms(frame, 2) < 500:
                quiet_for += frame_seconds
            else:
                quiet_for = 0.0
            if quiet_for >= self.cfg.silence_seconds and len(chunks) > 4:
                break
            if time.monotonic() - started >= self.cfg.command_seconds:
                break
        return b"".join(chunks)

    def text_mode(self) -> None:
        """Fallback loop: typed commands, same router, same replies."""
        if not sys.stdin or not sys.stdin.isatty():
            log.info("no tty for text mode; idling so the HTTP brief stays served")
            while not self._stop.wait(3600):
                pass
            return
        print("RORY text mode — type a command, or 'quit'.")
        while not self._stop.is_set():
            try:
                line = input("> ").strip()
            except (EOFError, KeyboardInterrupt):
                return
            if line.lower() in {"quit", "exit"}:
                return
            reply = self.respond(line)
            if reply:
                print(reply)

    def stop(self) -> None:
        self._stop.set()


# --------------------------------------------------------------------------
# Local HTTP surface, so the browser HUD always has a current brief
# --------------------------------------------------------------------------

def make_server(rory: Rory) -> ThreadingHTTPServer:
    """Serve the brief and state on loopback for the HUD to poll."""

    class Handler(BaseHTTPRequestHandler):
        def _send(self, payload: dict, status: int = 200) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            # Loopback only, but the HUD may be opened from file://.
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
            if self.path.rstrip("/") in ("/brief", ""):
                self._send(rory.refresh_brief().to_dict())
            elif self.path.rstrip("/") == "/state":
                try:
                    self._send(json.loads(Path(rory.cfg.state_file).read_text("utf-8")))
                except Exception:
                    self._send({"error": "state unavailable"}, 503)
            elif self.path.rstrip("/") == "/health":
                self._send({
                    "ok": True,
                    "wake": rory.wake.available,
                    "stt": rory.ears.available,
                    "voice": rory.voice.available,
                })
            else:
                self._send({"error": "not found"}, 404)

        def log_message(self, *_args) -> None:
            pass  # keep the daemon log clean

    return ThreadingHTTPServer(("127.0.0.1", rory.cfg.http_port), Handler)


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="roryd", description="Always-on RORY voice daemon"
    )
    parser.add_argument("--once", metavar="COMMAND",
                        help="route one command, print the reply, and exit")
    parser.add_argument("--brief", action="store_true",
                        help="print today's brief and exit")
    parser.add_argument("--text", action="store_true",
                        help="skip the microphone and take typed commands")
    parser.add_argument("--no-hud", action="store_true", help="do not open the HUD")
    parser.add_argument("--no-serve", action="store_true", help="do not start the HTTP surface")
    parser.add_argument("--check", action="store_true",
                        help="report which capabilities are available and exit")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    cfg = load_config()
    setup_logging(cfg, args.verbose)

    if args.brief:
        b = brief_mod.build(cfg.state_file, cfg.ledger_file, honorific=cfg.honorific)
        print(b.spoken())
        return 0

    rory = Rory(cfg)

    if args.check:
        print(json.dumps({
            "wake_word": rory.wake.available,
            "speech_to_text": rory.ears.available,
            "voice_out": rory.voice.available,
            "microphone": Microphone().available,
            "state_file": str(cfg.state_file),
            "state_found": cfg.state_file.exists(),
            "log_file": str(cfg.log_file),
        }, indent=2))
        return 0

    if args.once:
        print(rory.respond(args.once))
        return 0

    server = None
    if not args.no_serve:
        try:
            server = make_server(rory)
            threading.Thread(target=server.serve_forever, daemon=True).start()
            log.info("brief served on http://127.0.0.1:%d/brief", cfg.http_port)
        except OSError as exc:
            log.warning("could not start HTTP surface: %s", exc)

    if cfg.open_hud_on_start and not args.no_hud and cfg.hud_file.exists():
        try:
            webbrowser.open(cfg.hud_file.as_uri())
        except Exception as exc:
            log.warning("could not open the HUD: %s", exc)

    rory.greet()
    try:
        if args.text:
            rory.text_mode()
        else:
            rory.listen_forever()
    except KeyboardInterrupt:
        pass
    finally:
        rory.stop()
        if server is not None:
            server.shutdown()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())

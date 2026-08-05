"""CentLabs glasses bridge — the web-app path.

The Meta Ray-Ban Display web-app path loads a web page (served here at /bridge)
that runs in the glasses' web view. The reasoning does not happen in the
glasses; the page forwards what the operator sees to this relay on Node 001,
which runs the real CentLabs tools and returns a render-ready payload.

Endpoints (all JSON, loopback/tailnet only, behind Caddy TLS in production):

    GET  /bridge/            the glasses web HUD (static)
    GET  /brief              the RORY brief, from the same state.json the HUD uses
    POST /assess             device observations -> the Spotter HUD contract
    GET  /health             which capabilities this Node can serve

Design, consistent with the rest of CentLabs:

  * Everything degrades cleanly. No `sentinel` binary -> /assess returns an
    honest "spotter unavailable" card instead of failing. No state file ->
    /brief still answers.
  * Secrets and impactful actions fail closed. If CENTLABS_BRIDGE_TOKEN is set,
    every data endpoint requires it (constant-time compare); the glasses page
    carries it. It is read-only device assessment, so an unset token logs a
    loud warning rather than refusing — set it in production.
  * The bridge shells out to the trusted `sentinel` binary; it never
    reimplements Spotter's logic, so the glass shows exactly what the CLI does.
"""

from __future__ import annotations

import hmac
import json
import logging
import os
import shutil
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

log = logging.getLogger("centlabs.bridge")

WEB_DIR = Path(__file__).resolve().parent / "web"


def repo_root() -> Path:
    override = os.environ.get("RORY_HOME", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    # centlabs/bridge/bridge.py -> repo root is two levels up.
    return Path(__file__).resolve().parents[2]


def sentinel_bin() -> str | None:
    """Locate the sentinel binary: SENTINEL_BIN wins, else PATH."""
    explicit = os.environ.get("SENTINEL_BIN", "").strip()
    if explicit and Path(explicit).exists():
        return explicit
    return shutil.which("sentinel")


def _token() -> str:
    return os.environ.get("CENTLABS_BRIDGE_TOKEN", "").strip()


def authorized(headers) -> bool:
    """Enforce the shared token when one is configured; otherwise allow."""
    secret = _token()
    if not secret:
        return True  # dev mode; a warning is logged at startup
    presented = headers.get("X-CentLabs-Token", "")
    return hmac.compare_digest(presented, secret)


# --------------------------------------------------------------------------
# Spotter
# --------------------------------------------------------------------------

def run_spotter(payload: dict) -> dict:
    """Translate a bridge request into `sentinel spot --format hud` and return
    the HUD card. Falls back to an honest unavailable card."""
    binary = sentinel_bin()
    if not binary:
        return _unavailable_card(
            "Spotter is not installed on this Node yet. Build the sentinel "
            "binary and set SENTINEL_BIN."
        )

    args = [binary, "spot", "--format", "hud"]
    for obs in payload.get("observe", []) or []:
        kind = str(obs.get("kind", "")).strip()
        value = str(obs.get("value", "")).strip()
        if kind and value:
            args += ["--observe", f"{kind}={value}"]
    if payload.get("mac"):
        args += ["--mac", str(payload["mac"])]
    if payload.get("firmware"):
        args += ["--firmware", str(payload["firmware"])]
    exposure = str(payload.get("exposure", "unknown")).strip() or "unknown"
    args += ["--exposure", exposure]
    if payload.get("default_credentials_suspected"):
        args += ["--default-credentials-suspected"]
    if payload.get("unenrolled"):
        args += ["--unenrolled"]

    try:
        result = subprocess.run(
            args, capture_output=True, text=True, timeout=20,
            cwd=str(repo_root()),
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        log.warning("spotter invocation failed: %s", exc)
        return _unavailable_card("Spotter did not respond.")

    if result.returncode != 0 or not result.stdout.strip():
        log.warning("spotter exit=%s stderr=%s", result.returncode, result.stderr[:200])
        return _unavailable_card("Spotter could not assess that input.")

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return _unavailable_card("Spotter returned an unreadable result.")


def _unavailable_card(reason: str) -> dict:
    """A HUD card in the same shape the glasses render, for the degraded path."""
    return {
        "state": "searching",
        "line1": "Spotter offline",
        "line2": reason,
        "accent": "watch",
        "confidence": "unknown",
        "concerns": 0,
        "speech": reason,
        "unavailable": True,
    }


# --------------------------------------------------------------------------
# Brief
# --------------------------------------------------------------------------

def read_brief() -> dict:
    """The one-line brief for the glass. Reads the same state.json the HUD and
    the agents use; never invents progress."""
    state_file = repo_root() / "rory" / "state.json"
    try:
        state = json.loads(state_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"headline": "", "done": 0, "decisions": 0,
                "line": "No brief available."}

    brief = state.get("brief") or {}
    items = brief.get("items") or []
    done = sum(1 for i in items if isinstance(i, dict) and i.get("kind") == "done")
    decisions = sum(
        1 for r in (state.get("roadblocks") or [])
        if isinstance(r, dict) and r.get("needsUser")
    )
    line = (f"{done} landed · {decisions} need you" if decisions
            else f"{done} landed · nothing waiting on you")
    return {
        "headline": brief.get("headline", ""),
        "done": done,
        "decisions": decisions,
        "line": line,
    }


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

def make_server(port: int) -> ThreadingHTTPServer:
    class Handler(BaseHTTPRequestHandler):
        def _send(self, payload, status=200, content_type="application/json"):
            if content_type == "application/json":
                body = json.dumps(payload).encode()
            else:
                body = payload if isinstance(payload, bytes) else str(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "X-CentLabs-Token, Content-Type")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _serve_static(self, rel: str):
            # Serve the glasses web app. Only files under WEB_DIR, no traversal.
            name = rel or "index.html"
            target = (WEB_DIR / name).resolve()
            if not target.is_relative_to(WEB_DIR) or not target.is_file():
                self._send({"error": "not found"}, 404)
                return
            ctype = "text/html" if target.suffix == ".html" else "application/octet-stream"
            self._send(target.read_bytes(), content_type=ctype)

        def do_OPTIONS(self):  # noqa: N802 - CORS preflight for the web app
            self._send({}, 204)

        def do_GET(self):  # noqa: N802
            path = self.path.split("?")[0].rstrip("/")
            if path in ("/bridge", ""):
                self._serve_static("index.html")
            elif path.startswith("/bridge/"):
                self._serve_static(path[len("/bridge/"):])
            elif path == "/health":
                self._send({
                    "ok": True,
                    "spotter": sentinel_bin() is not None,
                    "brief": (repo_root() / "rory" / "state.json").exists(),
                    "token_required": bool(_token()),
                })
            elif path == "/brief":
                if not authorized(self.headers):
                    self._send({"error": "unauthorized"}, 401)
                    return
                self._send(read_brief())
            else:
                self._send({"error": "not found"}, 404)

        def do_POST(self):  # noqa: N802
            path = self.path.split("?")[0].rstrip("/")
            if path != "/assess":
                self._send({"error": "not found"}, 404)
                return
            if not authorized(self.headers):
                self._send({"error": "unauthorized"}, 401)
                return
            length = int(self.headers.get("Content-Length", 0) or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(raw or b"{}")
            except json.JSONDecodeError:
                self._send({"error": "invalid JSON"}, 400)
                return
            self._send(run_spotter(payload))

        def log_message(self, *_a):
            pass

    return ThreadingHTTPServer(("0.0.0.0", port), Handler)


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(prog="centlabs-bridge",
                                     description="CentLabs glasses web-app bridge")
    parser.add_argument("--port", type=int, default=int(os.environ.get("CENTLABS_BRIDGE_PORT", "8794")))
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if not _token():
        log.warning("CENTLABS_BRIDGE_TOKEN is not set — the bridge is OPEN. "
                    "Set it (and put it in the glasses page) for production.")
    log.info("spotter: %s", sentinel_bin() or "NOT FOUND (degraded)")

    server = make_server(args.port)
    log.info("bridge on http://0.0.0.0:%d  (glasses HUD at /bridge/)", args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())

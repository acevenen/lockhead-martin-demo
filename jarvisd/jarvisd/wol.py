"""Turning a machine on by voice.

A PC cannot literally boot from software running on itself, so "Alexa, turn on
Node 001" always has the same shape: something that is already awake sends a
Wake-on-LAN magic packet to the sleeping machine's network card, which stays
powered on the standby rail and boots the board when it sees its own address.

This module is the always-awake sender. It provides:

  * ``magic_packet`` / ``wake`` — build and broadcast the packet (pure stdlib);
  * a tiny authenticated HTTP endpoint (``serve``) that a phone Shortcut, a
    Home Assistant automation, or an Alexa bridge can POST to, so a voice
    command anywhere on the tailnet becomes a boot.

Alexa cannot send a magic packet itself; it needs a bridge. This endpoint is
that bridge — run it on any always-on device on the same wired LAN as the
target (a Raspberry Pi, a router that runs containers, or another CentLabs
node). The honest fallback that needs no bridge at all — a smart plug plus the
motherboard's "Restore on AC Power Loss = Power On" — is documented in the
README; it is a hard power cut and is only safe on a machine that is genuinely
off.
"""

from __future__ import annotations

import hmac
import json
import logging
import os
import re
import socket
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

log = logging.getLogger("jarvisd.wol")

_MAC_RE = re.compile(r"^[0-9a-fA-F]{2}([:-]?)([0-9a-fA-F]{2}\1){4}[0-9a-fA-F]{2}$")


def normalize_mac(mac: str) -> str:
    """Return the 12 hex digits of a MAC in any separator form, or raise."""
    cleaned = re.sub(r"[^0-9a-fA-F]", "", str(mac))
    if len(cleaned) != 12:
        raise ValueError(f"not a MAC address: {mac!r}")
    return cleaned.lower()


def magic_packet(mac: str) -> bytes:
    """Build the 102-byte magic packet: 6x 0xFF then the MAC repeated 16 times."""
    target = bytes.fromhex(normalize_mac(mac))
    return b"\xff" * 6 + target * 16


def wake(mac: str, broadcast: str = "255.255.255.255", port: int = 9,
         repeat: int = 3) -> None:
    """Broadcast a magic packet for ``mac``.

    Sent a few times because it is a fire-and-forget UDP datagram and a single
    packet can be dropped. Use the target's subnet-directed broadcast address
    (e.g. 192.168.1.255) when waking across a router or a Tailscale subnet
    route, since 255.255.255.255 does not cross subnets.
    """
    packet = magic_packet(mac)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        for _ in range(max(1, repeat)):
            sock.sendto(packet, (broadcast, port))
    log.info("sent magic packet to %s via %s:%d", normalize_mac(mac), broadcast, port)


# --------------------------------------------------------------------------
# HTTP bridge: POST here to wake a registered machine
# --------------------------------------------------------------------------

def _load_targets() -> dict[str, dict]:
    """Named wake targets from JARVIS_WOL_TARGETS.

    Format: name=MAC[/broadcast][,name=MAC...], e.g.
        node001=AA:BB:CC:DD:EE:FF/192.168.1.255,mac=11:22:33:44:55:66
    """
    raw = os.environ.get("JARVIS_WOL_TARGETS", "").strip()
    targets: dict[str, dict] = {}
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk or "=" not in chunk:
            continue
        name, spec = chunk.split("=", 1)
        mac, _, bcast = spec.partition("/")
        try:
            normalize_mac(mac)
        except ValueError:
            log.warning("skipping WoL target %r: bad MAC", name)
            continue
        targets[name.strip().lower()] = {
            "mac": mac.strip(),
            "broadcast": bcast.strip() or "255.255.255.255",
        }
    return targets


def _verify(token: str, secret: str) -> bool:
    """Constant-time comparison of the shared token."""
    return bool(secret) and hmac.compare_digest(token, secret)


def serve(port: int = 8792) -> ThreadingHTTPServer:  # pragma: no cover - network
    """A minimal authenticated wake endpoint.

    POST /wake/<name>  with header  X-Token: <JARVIS_WOL_TOKEN>
    A missing or wrong token is refused. With no token configured the endpoint
    refuses everything, so it is never accidentally left open.
    """
    secret = os.environ.get("JARVIS_WOL_TOKEN", "").strip()
    targets = _load_targets()

    class Handler(BaseHTTPRequestHandler):
        def _reply(self, code: int, payload: dict) -> None:
            body = json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self) -> None:  # noqa: N802
            if not secret:
                self._reply(503, {"error": "JARVIS_WOL_TOKEN not set; endpoint disabled"})
                return
            if not _verify(self.headers.get("X-Token", ""), secret):
                self._reply(401, {"error": "unauthorized"})
                return
            match = re.match(r"^/wake/([\w\-]+)/?$", self.path)
            if not match:
                self._reply(404, {"error": "POST /wake/<name>"})
                return
            name = match.group(1).lower()
            target = targets.get(name)
            if not target:
                self._reply(404, {"error": f"unknown target {name!r}", "known": list(targets)})
                return
            try:
                wake(target["mac"], target["broadcast"])
                self._reply(200, {"woke": name})
            except Exception as exc:
                self._reply(500, {"error": str(exc)})

        def log_message(self, *_a) -> None:
            pass

    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    log.info("WoL bridge on :%d, targets: %s", port, ", ".join(targets) or "(none)")
    return server


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(prog="jarvisd-wol", description="Wake-on-LAN sender + bridge")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_send = sub.add_parser("send", help="send one magic packet and exit")
    p_send.add_argument("mac")
    p_send.add_argument("--broadcast", default="255.255.255.255")
    p_send.add_argument("--port", type=int, default=9)

    p_serve = sub.add_parser("serve", help="run the authenticated wake endpoint")
    p_serve.add_argument("--port", type=int, default=8792)

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if args.cmd == "send":
        wake(args.mac, args.broadcast, args.port)
        return 0
    if args.cmd == "serve":  # pragma: no cover - network
        server = serve(args.port)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            server.shutdown()
        return 0
    return 2


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())

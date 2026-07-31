"""Tests for the CentLabs glasses bridge.

These cover the parts that carry the load-bearing promises: the bridge shells
to the *real* sentinel binary (never reimplements Spotter), it degrades to an
honest card when the binary is missing or misbehaves, it fails closed on the
token, it never serves files outside the web directory, and /brief reads the
same state.json the rest of CentLabs uses.

A tiny stub stands in for the sentinel binary so the suite has no Go toolchain
dependency; one test echoes argv so we can prove the observation translation is
exactly what `sentinel spot` expects. The end-to-end path against the real
binary is exercised by hand and in the PR description.
"""

from __future__ import annotations

import http.client
import json
import os
import stat
import threading
from pathlib import Path

import pytest

import bridge


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _write_stub(path: Path, body: str) -> str:
    """Write an executable python stub and return its path."""
    path.write_text("#!/usr/bin/env python3\n" + body)
    path.chmod(path.stat().st_mode | stat.S_IEXEC | stat.S_IRUSR)
    return str(path)


# A stub that echoes the argv it was called with, plus a valid HUD card, so a
# test can assert the exact flags the bridge built.
ARGV_ECHO = """
import json, sys
print(json.dumps({
    "state": "confirmed", "line1": "stub", "line2": "", "accent": "ok",
    "confidence": "confirmed", "risk_band": "low", "concerns": 0,
    "argv": sys.argv[1:],
}))
"""


@pytest.fixture
def stub_sentinel(tmp_path, monkeypatch):
    def _install(body: str) -> str:
        p = _write_stub(tmp_path / "sentinel-stub", body)
        monkeypatch.setenv("SENTINEL_BIN", p)
        return p
    return _install


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    # Each test starts from a known-empty token and no binary.
    monkeypatch.delenv("CENTLABS_BRIDGE_TOKEN", raising=False)
    monkeypatch.delenv("SENTINEL_BIN", raising=False)


# --------------------------------------------------------------------------
# run_spotter — translation and degraded paths
# --------------------------------------------------------------------------

def test_run_spotter_unavailable_when_no_binary(monkeypatch):
    monkeypatch.setattr(bridge, "sentinel_bin", lambda: None)
    card = bridge.run_spotter({"observe": [{"kind": "logo", "value": "hikvision"}]})
    assert card["unavailable"] is True
    assert card["state"] == "searching"
    # A degraded card is still in the shape the glass renders.
    assert {"line1", "line2", "accent", "speech"} <= card.keys()


def test_run_spotter_translates_observations(stub_sentinel):
    stub_sentinel(ARGV_ECHO)
    card = bridge.run_spotter({
        "observe": [
            {"kind": "logo", "value": "hikvision"},
            {"kind": "mac-oui", "value": "44:19:B6:11:22:33"},
        ],
        "exposure": "internet",
        "default_credentials_suspected": True,
    })
    argv = card["argv"]
    assert argv[:3] == ["spot", "--format", "hud"]
    assert "--observe" in argv and "logo=hikvision" in argv
    assert "mac-oui=44:19:B6:11:22:33" in argv
    assert "--exposure" in argv and "internet" in argv
    assert "--default-credentials-suspected" in argv
    # We did not pass these, so the bridge must not invent them.
    assert "--unenrolled" not in argv
    assert "--firmware" not in argv


def test_run_spotter_passes_unenrolled_and_optionals(stub_sentinel):
    stub_sentinel(ARGV_ECHO)
    card = bridge.run_spotter({
        "observe": [{"kind": "logo", "value": "dahua"}],
        "exposure": "lan",
        "unenrolled": True,
        "mac": "90:02:a9:00:00:01",
        "firmware": "1.2.3",
    })
    argv = card["argv"]
    assert "--unenrolled" in argv
    assert argv[argv.index("--mac") + 1] == "90:02:a9:00:00:01"
    assert argv[argv.index("--firmware") + 1] == "1.2.3"


def test_run_spotter_skips_blank_observations(stub_sentinel):
    stub_sentinel(ARGV_ECHO)
    card = bridge.run_spotter({
        "observe": [
            {"kind": "logo", "value": "hikvision"},
            {"kind": "", "value": "junk"},       # no kind -> dropped
            {"kind": "http-server", "value": ""},  # no value -> dropped
        ],
        "exposure": "unknown",
    })
    obs = [card["argv"][i + 1] for i, a in enumerate(card["argv"]) if a == "--observe"]
    assert obs == ["logo=hikvision"]


def test_run_spotter_unavailable_on_nonzero_exit(stub_sentinel):
    stub_sentinel("import sys; sys.stderr.write('boom'); sys.exit(3)")
    card = bridge.run_spotter({"observe": [{"kind": "logo", "value": "x"}]})
    assert card["unavailable"] is True


def test_run_spotter_unavailable_on_garbage(stub_sentinel):
    stub_sentinel("print('not json at all')")
    card = bridge.run_spotter({"observe": [{"kind": "logo", "value": "x"}]})
    assert card["unavailable"] is True


def test_run_spotter_returns_real_card(stub_sentinel):
    stub_sentinel(
        "import json;"
        "print(json.dumps({'state':'confirmed','line1':'Hikvision IP camera',"
        "'risk_band':'critical','concerns':4,'accent':'alert'}))"
    )
    card = bridge.run_spotter({"observe": [{"kind": "logo", "value": "hikvision"}]})
    assert card["line1"] == "Hikvision IP camera"
    assert card["risk_band"] == "critical"
    assert "unavailable" not in card  # a real card is not flagged degraded


# --------------------------------------------------------------------------
# Token — fails closed when configured, open (with a warning) when not
# --------------------------------------------------------------------------

def test_authorized_open_when_unset():
    assert bridge.authorized({}) is True


def test_authorized_requires_match_when_set(monkeypatch):
    monkeypatch.setenv("CENTLABS_BRIDGE_TOKEN", "s3cret")
    assert bridge.authorized({"X-CentLabs-Token": "s3cret"}) is True
    assert bridge.authorized({"X-CentLabs-Token": "nope"}) is False
    assert bridge.authorized({}) is False


# --------------------------------------------------------------------------
# Brief — reads the real state.json, never invents progress
# --------------------------------------------------------------------------

def test_read_brief_from_state(tmp_path, monkeypatch):
    state = {
        "brief": {"headline": "hello", "items": [
            {"kind": "done"}, {"kind": "done"}, {"kind": "work"},
        ]},
        "roadblocks": [{"needsUser": True}, {"needsUser": False}],
    }
    (tmp_path / "jarvis").mkdir()
    (tmp_path / "jarvis" / "state.json").write_text(json.dumps(state))
    monkeypatch.setenv("JARVIS_HOME", str(tmp_path))
    b = bridge.read_brief()
    assert b["done"] == 2
    assert b["decisions"] == 1
    assert "2 landed" in b["line"] and "1 need you" in b["line"]


def test_read_brief_missing_file(tmp_path, monkeypatch):
    monkeypatch.setenv("JARVIS_HOME", str(tmp_path))
    b = bridge.read_brief()
    assert b["done"] == 0
    assert b["line"] == "No brief available."


def test_read_brief_no_decisions_line(tmp_path, monkeypatch):
    state = {"brief": {"items": [{"kind": "done"}]}, "roadblocks": []}
    (tmp_path / "jarvis").mkdir()
    (tmp_path / "jarvis" / "state.json").write_text(json.dumps(state))
    monkeypatch.setenv("JARVIS_HOME", str(tmp_path))
    assert "nothing waiting on you" in bridge.read_brief()["line"]


# --------------------------------------------------------------------------
# HTTP surface — spin up the real server on an ephemeral port
# --------------------------------------------------------------------------

class _Server:
    def __init__(self):
        self.httpd = bridge.make_server(0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        conn.request(method, path, body=body, headers=headers or {})
        resp = conn.getresponse()
        data = resp.read()
        conn.close()
        return resp.status, data

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


@pytest.fixture
def server():
    s = _Server()
    try:
        yield s
    finally:
        s.close()


def test_http_health(server, stub_sentinel):
    stub_sentinel(ARGV_ECHO)
    status, data = server.request("GET", "/health")
    assert status == 200
    body = json.loads(data)
    assert body["ok"] is True
    assert body["spotter"] is True


def test_http_static_served(server):
    status, data = server.request("GET", "/bridge/")
    assert status == 200
    assert b"<!DOCTYPE html>" in data
    assert b"CENTLABS" in data


def test_http_static_traversal_blocked(server):
    status, _ = server.request("GET", "/bridge/../bridge.py")
    assert status == 404


def test_http_assess_runs_spotter(server, stub_sentinel):
    stub_sentinel(ARGV_ECHO)
    body = json.dumps({"observe": [{"kind": "logo", "value": "hikvision"}],
                       "exposure": "internet"})
    status, data = server.request("POST", "/assess", body=body,
                                  headers={"Content-Type": "application/json"})
    assert status == 200
    card = json.loads(data)
    assert card["argv"][:3] == ["spot", "--format", "hud"]


def test_http_assess_bad_json(server, stub_sentinel):
    stub_sentinel(ARGV_ECHO)
    status, _ = server.request("POST", "/assess", body=b"{not json",
                               headers={"Content-Type": "application/json"})
    assert status == 400


def test_http_unknown_route_404(server):
    status, _ = server.request("GET", "/nope")
    assert status == 404
    status, _ = server.request("POST", "/nope", body=b"{}")
    assert status == 404


def test_http_token_enforced(monkeypatch):
    monkeypatch.setenv("CENTLABS_BRIDGE_TOKEN", "letmein")
    s = _Server()
    try:
        # No token -> 401 on data endpoints...
        assert s.request("GET", "/brief")[0] == 401
        assert s.request("POST", "/assess", body=b"{}")[0] == 401
        # ...but /health stays open so you can see the door is locked.
        assert s.request("GET", "/health")[0] == 200
        # Correct token -> allowed through.
        ok = s.request("GET", "/brief", headers={"X-CentLabs-Token": "letmein"})[0]
        assert ok == 200
    finally:
        s.close()


def test_http_options_cors(server):
    status, _ = server.request("OPTIONS", "/assess")
    assert status == 204

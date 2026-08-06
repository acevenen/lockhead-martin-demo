"""Tests for the Wake-on-LAN packet builder and target parsing."""

from __future__ import annotations

import os

import pytest

from roryd import wol


def test_normalize_mac_accepts_every_form():
    for form in ["AA:BB:CC:DD:EE:FF", "aa-bb-cc-dd-ee-ff", "AABBCCDDEEFF", "aabb.ccdd.eeff"]:
        assert wol.normalize_mac(form) == "aabbccddeeff"


def test_normalize_mac_rejects_junk():
    for bad in ["", "not-a-mac", "AA:BB:CC", "AA:BB:CC:DD:EE:FF:00"]:
        with pytest.raises(ValueError):
            wol.normalize_mac(bad)


def test_magic_packet_is_102_bytes_with_correct_shape():
    pkt = wol.magic_packet("AA:BB:CC:DD:EE:FF")
    assert len(pkt) == 102
    assert pkt[:6] == b"\xff" * 6
    mac = bytes.fromhex("aabbccddeeff")
    # The MAC repeats exactly 16 times after the header.
    assert pkt[6:] == mac * 16


def test_wake_broadcasts_without_a_network(monkeypatch):
    sent = []

    class FakeSock:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def setsockopt(self, *a):
            pass

        def sendto(self, data, addr):
            sent.append((data, addr))

    monkeypatch.setattr(wol.socket, "socket", lambda *a, **k: FakeSock())
    wol.wake("AA:BB:CC:DD:EE:FF", "192.168.1.255", 9, repeat=3)
    assert len(sent) == 3
    assert all(len(d) == 102 for d, _ in sent)
    assert sent[0][1] == ("192.168.1.255", 9)


def test_target_parsing_from_env(monkeypatch):
    monkeypatch.setenv(
        "RORY_WOL_TARGETS",
        "node001=AA:BB:CC:DD:EE:FF/192.168.1.255, junk=nope, mac=11-22-33-44-55-66",
    )
    targets = wol._load_targets()
    assert targets["node001"] == {"mac": "AA:BB:CC:DD:EE:FF", "broadcast": "192.168.1.255"}
    assert targets["mac"]["broadcast"] == "255.255.255.255"  # default when omitted
    assert "junk" not in targets  # a bad MAC is skipped, not fatal


def test_token_verification_is_constant_time_and_strict():
    assert wol._verify("secret", "secret") is True
    assert wol._verify("wrong", "secret") is False
    assert wol._verify("secret", "") is False  # no secret configured -> refuse
    assert wol._verify("", "") is False

# SENTINEL SPOTTER — Glasses HUD Concept

What you see through the glasses when you look at a device you own.

```
open spotter/index.html      # double-click works; no build, no deps, no network
```

## The idea

Look at a camera. Know what it is, whether it matters, and what to do — in
about two seconds, hands-free.

This page renders the **exact JSON** that `sentinel spot --format hud` emits.
There is no business logic in the HUD: it shows state, it never decides state.
Swap the embedded payloads for a live fetch and the display is unchanged —
which is the whole point of a stable contract.

## Walk the states

| Button | Shows |
|---|---|
| `MY CAMERA` | confirmed identity, internet-exposed, critical — red reticle |
| `GARAGE CAM` | confirmed, LAN-only, medium — and note it does **not** tell you to undo an internet exposure you never had |
| `CONFLICTING` | the housing says one vendor, the hardware address says another — Spotter reports the conflict instead of guessing |
| `NOT MINE` | a device you have not enrolled: "a camera", and nothing else |
| `UNRECOGNIZED` | below the naming floor — it says so rather than picking the nearest entry |
| `DETAIL` | progressive disclosure: why this answer, the issues, the ranked plan, provenance |

Keys `1`–`5` switch scenes, `d` toggles detail, `Space` re-acquires. Tapping the
scene re-runs the scan the way a glance would.

## The two moments worth watching

**`NOT MINE`.** Spotter identifies the device internally, then withholds
everything: no vendor, no model, no advisories. Looking at hardware you do not
own cannot produce a reconnaissance report. In the Go engine this is enforced in
`ToHUD` and covered by a test that fails if a vendor name or a CVE identifier
appears anywhere in the serialized card.

**`CONFLICTING`.** Any one signal is weak — a logo can be a sticker, a MAC can be
a re-used NIC. Identity is fused in bits across independent evidence classes, and
a claim supported by a single class can never reach "confirmed". When the
evidence disagrees, the honest answer is that it disagrees.

## Reading the HUD

- **Reticle color** is the risk accent: green ok, amber watch, orange warn, red
  alert. It changes before you have read a word.
- **Line 1** is what it is. **Line 2** is whether it matters. **Line 3** is the
  single most worthwhile thing to do next.
- **Pips** are the risk band, glanceable without reading.
- **The notice** is always present: the shipped advisory corpus is an
  illustrative sample, not a substitute for NVD.

Voice output uses the browser's `en-GB` voice and speaks plain language — it
never reads CVE identifiers aloud.

## Where the real work lives

The engine is Go, in the Sentinel repo: `internal/spotter` (fusion, IoT firmware
version comparison, exposure-aware risk, remediation ranking, the HUD contract,
and the authorization guard) plus two provenance-carrying corpora in
`internal/knowledge`. See `docs/SPOTTER.md` there.

This page is the display surface for it.

# CentLabs → Meta Ray-Ban Display: the glasses bridge

How JARVIS and Spotter reach the glasses, why it's built the way it is, and the
short list of things that are gated on you (accounts + physical steps) versus
already done in software.

## The model: the glass is a display, not a brain

The Ray-Ban Display is a monocular HUD with a camera and mic, paired to the Meta
AI app on your phone. It is a **window into Node 001**, not a place to run logic.
So the split is deliberate:

```
  what you see / say                     the reasoning
  ┌───────────────────┐   Tailscale   ┌───────────────────────────────┐
  │  Ray-Ban Display  │──────────────▶│  Node 001                     │
  │  (web view / app) │   HTTPS       │   Caddy → bridge → sentinel    │
  │  renders the HUD  │◀──────────────│   spot / jarvisd / Hermes      │
  └───────────────────┘   HUD card    └───────────────────────────────┘
```

Everything that decides — device identity, exposure-aware risk, the brief —
lives on the Node, which we control, test, and audit. The glass only ever
renders a card. That keeps the sensitive logic off a device we don't fully own,
and means the glasses and the desktop show the *same* answer because it comes
from the *same* binary.

## Two paths, and why we started with the web app

Meta's Wearables Device Access Toolkit (display access opened **May 19 2026**)
offers two ways on:

| | **Web-app path** (built) | **Native iOS bridge** (next) |
|---|---|---|
| What it is | a web page in the glasses' web view | a Swift app the glasses launch |
| Camera/mic | limited to web APIs, needs HTTPS | full frame + audio access |
| Gate on you | just Tailscale + the Node | Meta four IDs + Apple Developer |
| Time to on-glass | **now** | more work |

We built the **web-app path first** because it puts a working HUD on the glass
with nothing but the Node and Tailscale — no Meta preview seat, no Xcode, no
Apple account required to see it work. The native bridge is a strict upgrade
(real camera frames feeding Spotter automatically instead of preset/spoken
observations), and it reuses this exact same bridge API — so nothing here is
throwaway.

## What's built (software, done)

- **`centlabs/bridge/bridge.py`** — the relay on Node 001. Serves the HUD and
  answers `/assess` (→ real `sentinel spot`) and `/brief` (→ `state.json`).
  Degrades cleanly, fails closed on its token, no path traversal.
  [Details + endpoints](bridge/README.md).
- **`centlabs/bridge/web/index.html`** — the glanceable HUD, tuned for the tiny
  monocular FOV: very high contrast, one thing at a time, readable in sun,
  speaks the result. Preset scenes stand in for camera/voice until the native
  path feeds real frames.
- **`centlabs/bridge/tests/`** — 20 tests holding the promises above.
- **`centlabs/node001/`** — the Compose data plane and the Caddy config that
  serves the HUD over `tls internal` (the secure context the web view needs for
  camera/mic) and reverse-proxies `/bridge`, `/assess`, `/brief` to the bridge.

Verified end-to-end on the build box: page → `/assess` → `sentinel spot --format
hud` → HUD card rendered (Hikvision, critical, 4 risk pips, spoken next action),
zero console errors; degraded and token-locked paths both behave.

## What's gated on you

Software-complete does not mean on-glass — three things only you can do:

1. **Tailscale on every device** (free). The mesh that lets the glasses reach
   Node 001. Nothing to hand me; you log each device in.
2. **Node 001 data plane up** — Docker Desktop + NVIDIA toolkit, then
   `cd centlabs/node001 && make bootstrap`. Install Caddy's local CA on your
   phone once so `https://node001` is trusted (Caddy prints how).
3. **Pair the Ray-Ban Display to the Meta AI app** on your iPhone 16 — Meta owns
   this layer. Then open `https://node001/bridge/` in the glasses' web view.

For the **native path** later, you'd also hand me the four Meta IDs (`MetaAppID`,
`ClientToken`, `TeamID`, `AppLinkURLScheme`) from your Meta app and an Apple
Developer account — all tracked in [CONNECT-CHECKLIST.md](CONNECT-CHECKLIST.md)
§5. None of that blocks seeing the web HUD work today.

## Next iterations

- **Native iOS bridge** — real camera frames → Spotter automatically, no preset
  scenes; push-to-talk over the same `/assess` API.
- **Voice in, on-glass** — wire `jarvisd`'s intents to `/brief` and Spotter so
  "hey jarvis, what is this?" runs the assessment hands-free.
- **Hermes `/ask`** — the glass asks the Node a free-form question and gets a
  spoken, memory-grounded answer, routed to the right model.

The bridge API is the stable seam: every one of these swaps what *feeds* it or
what *renders* it, never the reasoning in the middle.

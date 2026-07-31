# CentLabs glasses bridge

The **web-app path** onto the Meta Ray-Ban Display. A tiny relay on Node 001
that serves a glanceable HUD to the glasses' web view and answers the two things
the glass asks for: *"what am I looking at, and is it safe?"* and *"what's my
brief?"*

The glass renders. **Node 001 reasons.** The page never runs Spotter's logic;
it POSTs what the operator sees to this bridge, which shells out to the real
`sentinel spot` binary and returns a render-ready HUD card. Same amber house
style, same contract the CLI emits — so the glass shows exactly what the tool
decided, nothing reinterpreted.

```
Ray-Ban Display  ──HTTPS──▶  Caddy (Node 001)  ──▶  bridge.py  ──exec──▶  sentinel spot
   web view                   tls internal            :8794              (the real tool)
      ▲                                                  │
      └──────────────── HUD card (JSON) ◀────────────────┘
```

## Endpoints

| Method | Path | What it does |
|---|---|---|
| `GET`  | `/bridge/` | the glasses web HUD (static, `web/index.html`) |
| `GET`  | `/brief` | the JARVIS one-liner, from the same `jarvis/state.json` the HUD uses |
| `POST` | `/assess` | device observations → the Spotter HUD contract |
| `GET`  | `/health` | which capabilities this Node can serve right now |

`POST /assess` takes the observation set the operator "sees" and forwards it to
Spotter verbatim:

```json
{
  "observe": [
    {"kind": "logo", "value": "hikvision"},
    {"kind": "mac-oui", "value": "44:19:B6:11:22:33"},
    {"kind": "http-server", "value": "Hikvision-Webs"}
  ],
  "exposure": "internet",
  "default_credentials_suspected": true
}
```

and returns the HUD card `sentinel spot --format hud` produces — `state`,
`line1/2/3`, `accent`, `risk_band`, `next_action`, `speech`, and the sample-data
`notice`. The page renders that as-is.

## Design promises

These match the rest of CentLabs, and the [tests](tests/test_bridge.py) hold
each one:

- **It shells to the trusted binary; it never reimplements Spotter.** The glass
  can only show what the CLI would. `run_spotter` builds the exact `--observe`
  flags and nothing you didn't send.
- **Everything degrades cleanly.** No `sentinel` binary → `/assess` returns an
  honest *"Spotter offline"* card instead of an error. No `state.json` → `/brief`
  still answers. The glass never shows a stack trace.
- **Secrets fail closed.** If `CENTLABS_BRIDGE_TOKEN` is set, every data endpoint
  requires it (constant-time compare) and the glasses page carries it. It is
  read-only device assessment, so an *unset* token logs a loud warning rather
  than refusing — but set it in production. `/health` stays open so you can see
  the door is locked.
- **No path traversal.** The static handler serves only files under `web/`.

## Run it

```bash
# Build the tool once (from the sentinel repo):
go build -o /usr/local/bin/sentinel .

# Then, from the repo root:
export SENTINEL_BIN=/usr/local/bin/sentinel        # or put sentinel on PATH
export CENTLABS_BRIDGE_TOKEN=$(openssl rand -hex 24)  # set in prod; the page needs it too
python3 centlabs/bridge/bridge.py -v                 # serves on :8794
```

Open the HUD directly at `http://127.0.0.1:8794/bridge/` while developing. In
production the glasses load it through Caddy at `https://node001/bridge/` (TLS is
what makes camera/mic available in the web view). Pass the token to the page with
`?token=…` once; it is cached in `localStorage` after that. Point the page at a
non-default Node with `?api=https://node001`.

**Environment**

| Variable | Meaning |
|---|---|
| `SENTINEL_BIN` | path to the `sentinel` binary (else it's looked up on `PATH`) |
| `CENTLABS_BRIDGE_TOKEN` | shared token; unset = open (dev), set = required |
| `CENTLABS_BRIDGE_PORT` | listen port (default `8794`) |
| `JARVIS_HOME` | repo root override, for `/brief`'s `state.json` |

## Tests

```bash
python3 -m pytest centlabs/bridge/tests/ -q
```

No Go toolchain needed — a stub stands in for the binary (one test echoes argv to
prove the observation translation is exactly what `sentinel spot` expects). The
real end-to-end path (`bridge → sentinel spot → HUD`) is exercised against the
built binary and captured in the PR.

See [`../GLASSES-BRIDGE.md`](../GLASSES-BRIDGE.md) for where this sits in the
Meta toolkit and what's still needed to put it on the glass.

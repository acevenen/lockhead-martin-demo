# roryd — the always-on RORY daemon

Siri-on-your-PC. It starts when the machine comes up, listens for **"Hey
Rory,"** has the brief ready the moment you wake it, and answers with the same
command vocabulary as the browser HUD and the glasses.

It is built on one rule: **every capability is optional and degrades cleanly.**
With no microphone, no speakers, and none of the optional packages installed it
still starts, serves the brief, and takes typed commands — and it says so
plainly instead of pretending to listen. So you can install it now and turn
voice on later.

```sh
python3 -m roryd.daemon --check     # what's available on this machine
python3 -m roryd.daemon --brief     # print today's brief and exit
python3 -m roryd.daemon --once "hey jarvis, what did i miss"
python3 -m roryd.daemon             # run for real: listen + serve + open HUD
```

## Why "Hey Jarvis" needs no training

[openWakeWord](https://github.com/dscripka/openWakeWord) ships a **pretrained
`hey_jarvis` model** — the exact phrase, already trained, running locally on the
CPU at about 5% of one core, no cloud key. Verified: the model files
(`hey_jarvis_v0.1.onnx` / `.tflite`, ~1.3 MB) are release assets and download on
first run. The model is CC BY-NC-SA 4.0 — fine for personal use; if CentLabs
ever ships this commercially, retrain your own (the training pipeline is
Apache-2.0 and uses synthetic TTS data, so it's tractable).

After the wake word fires, the short command is transcribed locally by
faster-whisper (`base.en`, int8) — no audio leaves the machine.

> Install trap, already handled in `requirements.txt`: openWakeWord's default
> tflite path crashes under NumPy 2.x, so numpy is pinned `<2`.

## Install so it's always running

```sh
pip install -r requirements.txt
```

**macOS (MacBook Air):** edit the two `REPLACE_ME` paths in
`install/macos/com.centlabs.roryd.plist`, then:

```sh
cp install/macos/com.centlabs.roryd.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.centlabs.roryd.plist
```

Approve the microphone prompt on first run (a LaunchAgent runs in your GUI
session precisely so it can ask).

**Windows (Node 001):**

```powershell
powershell -ExecutionPolicy Bypass -File install\windows\install-roryd.ps1
```

This registers a Scheduled Task at logon — **not** a Service, deliberately: a
Windows service runs in Session 0 and cannot reach the microphone or your
desktop. Then turn the mic on in Settings > Privacy > Microphone (including
"let desktop apps access your microphone").

**Linux (future Node migration):** `install/linux/roryd.service`, a
`systemd --user` unit; `loginctl enable-linger` to run headless.

## Turning the PC on by voice — yes, it's possible

A machine can't boot from software running on itself, so this is always
"something already awake sends a **Wake-on-LAN** magic packet to the sleeping
machine's network card." The card stays powered on the standby rail and boots
the board when it sees its own MAC. Three ways, ranked:

**1. Home Assistant bridge (best, fully local).** HA's `wake_on_lan`
integration exposed to Alexa (via Nabu Casa, or `emulated_hue` for no cloud at
all) turns "Alexa, turn on the PC" into a magic packet on your LAN. Robust, and
HA earns its place in CentLabs anyway.

**2. This daemon's own bridge (no HA needed).** Run the wake endpoint on any
always-on device on the same **wired** LAN as the target:

```sh
export RORY_WOL_TARGETS="node001=AA:BB:CC:DD:EE:FF/192.168.1.255"
export RORY_WOL_TOKEN="a-long-random-secret"
python3 -m roryd.wol serve            # POST /wake/node001 with X-Token
python3 -m roryd.wol send AA:BB:CC:DD:EE:FF --broadcast 192.168.1.255
```

Point an Alexa routine, an iPhone Shortcut, or a Home Assistant automation at
`POST /wake/node001`. The endpoint refuses every request unless the token
matches, and refuses **all** requests if no token is set, so it's never
accidentally open.

**3. Smart plug + BIOS "Restore on AC Power Loss = On" (crude, no networking).**
Cutting and restoring wall power boots the board. Works with zero setup, but
it's a **hard power cut** — only safe on a machine that is genuinely off, never
to "reboot" a running one. A real last resort.

### Make WoL actually work (the part everyone gets wrong)

Run `install/windows/enable-wol.ps1` as admin (it disables **Fast Startup** —
the #1 reason WoL works from sleep but not shutdown, because Windows "shutdown"
is really a hibernate that never arms the NIC), then set in BIOS/UEFI:

| Setting | Value | Why |
|---|---|---|
| ErP Ready / EuP | **Disabled** | else the NIC loses standby power when off |
| Deep Sleep | **Disabled** | same |
| Power On By PCIe / Onboard LAN | **Enabled** | arms the NIC to wake the board |
| PME Event Wake Up | **Enabled** | the wake signal itself |

Ethernet only — Wake-on-Wireless is rare and unreliable on desktops. Waking
from **sleep (S3)** is the most reliable; **full shutdown (S5)** works on most
desktop boards once the above are set.

## Commands

Same vocabulary as the HUD, forgiving of transcription noise ("sentinal",
"travis" for "rory" all resolve):

| Say | Does |
|---|---|
| hey jarvis, brief me | what happened since you left |
| status report | one-breath sitrep |
| what did you do yesterday | yesterday's improvement + the pain it removed |
| what's my streak | consecutive days with a recorded improvement |
| open sentinel / show tasks / any roadblocks | surface that panel + speak it |
| show demos / agents | the demo bay / the roster |
| mute · unmute · goodnight | voice control; stand down but keep listening |

## The brief, and "every day must improve"

The daemon reads the same `rory/state.json` the HUD and the Claude Code agents
use, so the spoken brief and the screen can never disagree. It also reads
`rory/ledger.json`, the **daily improvement ledger** (`roryd/roryd/ledger.py`):
every entry must name an `improvement` **and** the `pain` it removes, or it is
rejected. You cannot close a day by recording activity — the format makes
progress mandatory, and "what did you do yesterday" reads it back to you.

## How the daemon talks to the HUD

On start it serves the brief on `http://127.0.0.1:8791` and opens
`rory/index.html`:

- `GET /brief` — the spoken + structured brief
- `GET /state` — the raw state file
- `GET /health` — which capabilities are live

## Security

- **Secrets are environment-only.** No key is written to disk by this package.
- **The WoL bridge fails closed** — no token, no wakes; wrong token, refused
  (constant-time compare).
- **STT is local.** After the wake word, audio is transcribed on-device and
  never sent anywhere.
- Bind the WoL bridge to your Tailscale interface in production so it is
  reachable across your devices but not from the open LAN.

## Tests

`PYTHONPATH=. python3 -m pytest tests/` — 54 tests over the brief, the ledger's
improvement discipline, intent routing (including transcription-error
tolerance), and the WoL packet/target/auth logic. The audio path needs
hardware and is verified by hand on the target machine.

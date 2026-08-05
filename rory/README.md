# R.O.R.Y — Personal Command HUD

A single-file, no-build voice dashboard: reactive orange orb, draggable
holographic popups, speech-to-speech, and a state file your Claude Code
agents keep current while you're away.

```
open rory/index.html          # double-click works
```

For the live state pipeline (agents updating the HUD), serve the folder so
`state.json` can be fetched:

```
python3 -m http.server 8000     # then open /rory/index.html
```

Opened from `file://` it falls back to the snapshot embedded in the page —
everything still works, the data is just frozen at last commit.

| Flag | Effect |
|---|---|
| `?fastboot` | skip the boot sequence |

## Talking to it

Three inputs, one intent router — anything you can say, you can type.

- **Wake word** — say “Rory”, wait for `COMMAND?`, then speak. Or say it
  in one breath: “Rory, brief me.”
- **Tap the orb** — arms command capture for nine seconds.
- **Command line** — type at the bottom. `/` focuses it, `Space` toggles
  the mic, `Esc` closes all panels.

| Say | Result |
|---|---|
| brief me · what did I miss | daily brief panel + spoken summary |
| status report | one-breath sitrep |
| open sentinel | Priority One panel |
| show tasks · projects | task board |
| operations · roadblocks | problems + proposed fixes |
| show demos · launch aegis | demo bay / opens AEGIS Overwatch |
| agents | the roster |
| mk one · mk two | amber ↔ cyan palette |
| mute · unmute | voice output |
| close everything | dismiss all panels |
| goodnight | stand down |

## Voice out

Works with zero setup using the system's British `en-GB` voice. For the
cinematic voice, open **Settings** and paste an ElevenLabs API key + voice
ID — stored in your browser's localStorage only, never in the repo. When a
key is present the orb is driven by a real FFT analyser on the returned
audio; without one it uses a synthetic envelope.

## The orb

One scalar (`amp`, 0–1) drives every layer: hot core, 64 radial ember
filaments, five noise-warped shell rings, a 340-particle swarm, and the
rotating HUD arcs. Idle breathes, listening simmers with your mic level,
speaking flares with the audio. Additive blending throughout; MK-I amber
(hue 30) and MK-II cyan (hue 194) are the same math with a hue swap.

## State pipeline

`state.json` is the contract between your agents and this screen:

```
brief.headline / brief.items[]   → DAILY BRIEF panel + spoken summary
priorities[]                     → PRIORITY ONE widget + SENTINEL panel
tasks[]                          → TASK BOARD + open-task count
roadblocks[]                     → OPERATIONS panel (needsUser = your call)
demos[]                          → DEMO BAY (launch buttons)
agents[]                         → AGENT ROSTER + active count
activity14[]                     → 14-day sparkline
```

`CLAUDE.md` at the repo root tells the agents to read it at session start
and rewrite it before signing off. The roster lives in `.claude/agents/`:
`sentinel-lead`, `demo-engineer`, `daily-brief`, `biz-ops`.

`knowledge/values.md` and `knowledge/business.md` are the decision context —
agents check calls against them and escalate anything they don't cover.
**Both ship with placeholders; fill them in.**

## Meta display / glasses

The layout has a third breakpoint for wide-short viewports
(`max-height: 520px`) that pulls the chrome in tight for a headset HUD, and
an icon-only dock under 760px. Everything is pointer-event driven, so a
gaze-and-pinch cursor works exactly like touch. All panels are draggable by
their title bar.

For native integration, the **Meta Wearables Device Access Toolkit** path is
the same one AEGIS uses: display HUD out, EMG wristband gestures in, with
the wristband's haptic channel replacing the browser Vibration API.

## Degradation

No mic, no network, no speech recognition, no WebGL — the page still boots,
still renders, and the typed command line still drives every intent.
Respects `prefers-reduced-motion`.

# AEGIS OVERWATCH — Holo-Tactical Concept Demo

A single-file, Tony-Stark-grade holographic command table built for a
**Lockheed Martin × Meta Ray-Ban Display** pitch. Walk in, hand someone the
glasses (or a phone/laptop), and let them run a strike package on a living
hologram of the Colorado Front Range.

> **SIMULATION ONLY.** Synthetic terrain, notional systems, no live-weapon
> interface. This is a concept demonstrator for an interface pitch — the goal
> is to book the full demo meeting.

## The pitch in one line

*The Meta display becomes a pocket JOC: a pinch-and-drag holographic theater,
fused with live satellite imagery, where designating a target and tasking an
asset takes four seconds and zero keyboards.*

## What's in the demo

- **Real-world theater** — the Denver Front Range (Lockheed Martin Space's
  backyard): downtown Denver grid (**Sector ALPHA**), the Rockies ridgeline
  (**Sector BRAVO**), and the eastern plains agri-belt with center-pivot
  fields (**Sector CHARLIE**). Three biomes, one map, all procedurally built
  as a glowing contour-line hologram with the South Platte cutting through.
- **Sat-uplink window** — a live top-down orbital camera feed that tracks
  whatever you target (concept stand-in for **Google Maps Platform
  Photorealistic 3D Tiles** streaming).
- **Target designation** — tap terrain: lat/lon, MGRS-style grid, elevation,
  sector ROE. Reticle with rotating outer ring and sky-beam.
- **Arsenal (all Lockheed families)**
  1. `JASSM-ER` standoff cruise missile — bezier flight path, particle trail, fireball, shockwave, scorch decal, camera shake
  2. `VECTIS` UCAV — Skunk Works loyal-wingman ingress + JAGM release
  3. `C-130J` airdrop — pallet, chute, landing beacon
  4. `PATHFINDER` recon team — 4-man insert + Stalker VXE scan rings
- **Destructible world** — strikes carve persistent craters into the terrain
  itself (the mountain range deforms, city blocks get holes blown in them),
  buildings collapse to rubble stubs with debris bursts, farmsteads flatten,
  trees inside the blast radius are erased, and water impacts splash instead.
- **Pattern-of-life simulation** — 112 pedestrians walking the street grid,
  61 vehicles (grid traffic, the diagonal avenue, farm trucks, amber taxis),
  bird flocks over the lake and city, elk and deer herds grazing the
  foothills. Everything scatters from a blast; traffic halts.
- **Landmark lock** — the Colorado State Capitol with its gold dome and
  beacon (heritage-shielded from strikes, and the log tells you so).
- **Living landscape** — Chatfield Reservoir with animated ripples, 760
  conifers/cottonwoods, 420 bushes, riparian corridors, farm windbreaks,
  10 farmsteads (house + barn + silo), and crop-row fields.
- **Mission log** with military brevity codes, dual-key authorize flow,
  EXECUTE button, keyboard shortcuts (1–4, Space, Esc).
- **Two hologram palettes** — MK-II Cyan (ops) and MK-I Amber (the garage).
- **Cinematic mode** — a scripted end-to-end demo run for walk-in showings
  (`▶ CINEMATIC` button, or open with `?autodemo`).
- Boot sequence, synth SFX (WebAudio, muted by default), haptics via the
  Vibration API on phones, full touch support (pinch zoom / drag orbit /
  two-finger pan / tap target).

## Run it

No build, no server needed:

```
open index.html            # double-click works too (three.js is vendored)
```

Useful URL flags:

| Flag | Effect |
|---|---|
| `?fastboot` | skip the boot sequence |
| `?autodemo` | fastboot + auto-run the cinematic demo loop |

Build the self-contained single-file version (three.js inlined, for hosting
as an artifact / kiosk page):

```
node tools/build-artifact.mjs dist/artifact.html
```

## Demo script (2 minutes)

1. Let it boot — the uplink handshake sets the story (Meta HUD paired, Google Earth mesh lock).
2. Pinch/drag the theater. Fly the sector tabs: city → range → agri.
3. Tap downtown, arm `JASSM-ER`, hit EXECUTE — watch the strike land **and**
   watch it live in the sat window.
4. Tap the agri-belt, drop a `C-130J` resupply — "same interface, humanitarian
   tasking."
5. Insert `PATHFINDER` on the ridgeline. Toggle MK-I Amber. Book the meeting.

## Production integration path

| Demo stand-in | Production system |
|---|---|
| Procedural holo terrain | Google Maps Platform **Photorealistic 3D Tiles** / Google Earth Engine imagery |
| Sat-uplink window | Live GEOINT feed (commercial EO constellation tasking) |
| Browser + touch | **Meta Wearables Device Access Toolkit** — display HUD + EMG wristband gestures |
| WebAudio/Vibration haptics | Native wristband haptic channel |
| Notional asset animations | C2 sandbox integration (training/wargaming only) |

## Stack

One `index.html` (~1,400 lines), Three.js r128 vendored in `vendor/`.
No other dependencies, no network calls at runtime — it runs air-gapped.

> **This repo also hosts [R.O.R.Y](rory/README.md)** — the personal
> voice command HUD that manages this workspace. `open rory/index.html`.

# AEGIS OVERWATCH — Holo-Tactical Concept Demo

A single-file, Tony-Stark-grade holographic command table built for a
**Lockheed Martin × Meta Ray-Ban Display** pitch. Walk in, hand someone the
glasses (or a phone/laptop), and let them run a strike package on a living
hologram of **any city on Earth** — 51 destinations, each built from real
coordinates and real elevation data.

> **SIMULATION ONLY.** Synthetic terrain, notional systems, no live-weapon
> interface. This is a concept demonstrator for an interface pitch — the goal
> is to book the full demo meeting.

## The pitch in one line

*The Meta display becomes a pocket JOC: a pinch-and-drag holographic theater,
fused with live satellite imagery, where designating a target and tasking an
asset takes four seconds and zero keyboards.*

## What's in the demo

- **Anywhere on Earth — 51 destinations.** A searchable theater console
  (`🌐 THEATER`, or press **G**) loads any site in the atlas in about two
  seconds. Type a city, country or region; arrow keys and Enter deploy.
  Every site is grounded in **real geography**: real coordinates and a real
  10×10 elevation grid sampled from ETOPO1 at build time (Everest 3,702→7,836 m,
  Venice −27→57 m, Grand Canyon 1,022→2,779 m). Baked into the page, so it
  still runs air-gapped from `file://` with no network calls.
- **Every destination looks like itself.** Eight street-grid archetypes
  (orthogonal, radial, organic, dense, superblock, colonial, canal, none) with
  each city's real grid bearing — Manhattan's 29°, Barcelona's 45°. Building
  heights follow the empirical urban gradient
  `h(r) = hFloor + (hCore − hFloor)·e^(−r/L)` calibrated to GHSL satellite
  data, so **Paris is a 22 m cap, Hong Kong a 96 m wall, Dubai an 11 m villa
  carpet with an 828 m needle** — and those contrasts are true *between*
  cities because buildings share one global metres-to-units scale. Per-city
  roof palettes (Paris zinc, Marrakesh ochre, Seoul's green membrane) carry
  most of the aerial read.
- **⚔ BATTLE — force-on-force simulation.** Press `⚔ BATTLE` (or **B**) and two
  24-unit combined-arms forces deploy and fight it out: M1 Abrams, M2 Bradleys,
  Strykers, Humvees, M109 Paladins, HIMARS, AH-64 Apaches and rifle squads.
  Units acquire, close, and engage using **published effective ranges** — a
  rifle reaches 500 m and a 120 mm gun 3,500 m, so infantry genuinely has to
  advance while armour trades at distance. Belt-fed weapons fire **6–9 round
  bursts and pause** rather than streaming, and rifles are aimed semi-auto
  (continuous full-auto is the most common realism error in battle sims).
  Armour value is checked against each weapon's AP performance, so an MG will
  not kill a tank. Faction ID rings, tracers, muzzle flashes, and a live
  force-strength HUD. The battle damages the actual city — structures collapse,
  glazing fails, civilians are caught in it. A **sniper team** occupies a hide
  on each flank with an M107 at 1,800 m and holds it rather than joining the
  advance. Deaths are animated and permanent: armour slumps onto a track,
  chars, and goes on smoking where it died; infantry fall; a downed Apache
  windmills its rotor on the way in. **Wrecks stay**, so the battlefield
  accumulates its own history. Guns recoil along their axis and kick a blast
  plume off the ground, hulls lean into turns and squat under power, and
  tracked vehicles throw dust off the running gear.
  - **The war is theater-wide: 114 units on three axes.** An armour fight at
    the city, a mech-infantry fight in the hills, a recon screen on the flank,
    with artillery, MLRS and a helo section in depth at the map edges — their
    21/32 km reach covers every sector, so shellfire arrives from off-screen
    the way it actually would.
  - **Infantry fight on foot.** The same articulated rig as the crowd, in
    faction kit with a rifle in hand: distance-driven walk on the advance, a
    braced aim stance in contact, and a fall that pitches about the feet.
- **First-person view models.** Enter any seat and you are holding something:
  rifle with iron sights, scoped M107 in the hide, pintle .50 with spade grips
  and a feeding belt up in the hatch, canopy frame and glareshield MFDs in the
  Apache, binoculars at the gun line. They sway with movement, breathe at
  rest, kick with the unit's real recoil and flash when it actually fires.
- **◐ HOLO / ◑ REAL — two complete looks over one scene** (button, or **H**).
  HOLO is the tactical projection: additive wireframe terrain, unlit models
  washed to a single hue, black void. REAL is a lit world: shaded ground in the
  destination's own albedo, sky gradient, distance fog, sun and bounce fill,
  draped asphalt streets, and models in their authored colours. Modes swap
  **material state, never geometry** — nothing is rebuilt, toggling is instant,
  and the simulation cannot desync. Every material is registered once with a
  role, so anything added later gets both looks for free.
- **Crew POV — pop into any unit's seat.** During a battle, tap a unit or press
  `[` / `]` and the camera flies from the table into that crew's head over
  1.15 s, GTA-style. Helmet-cam framing with the table UI cleared away, live
  HP, heading, and range to that unit's own target, and a signal-lost hand-back
  when the crew is killed. Eye height comes from the unit class, so a prone
  sniper, a tank commander in the hatch and an Apache pilot are all at their
  real heights. Cycling walks the combined-arms picture rather than one type at
  a time: nine presses gives pilot, tank commander, IFV gunner, vehicle
  commander, gun chief, launcher crew, gunner, sniper, rifleman.
- **Real landmarks, one-to-one.** Eighteen structures authored in real metres
  and merged to a single geometry each — the **Golden Gate** (227 m towers,
  1,280 m main span, parabolic cables), **Salesforce Tower**, the **Statue of
  Liberty** on its eleven-point Fort Wood star, the **Empire State**, the
  **Eiffel Tower** with its splayed bezier legs, **Mount Fuji** with the
  concave sweep that separates it from a party hat, **Tokyo Skytree**, the
  **Elizabeth Tower**, the **Colosseum** with 50 arch bays and a half-ruined
  third order, **Giza**, the **Sydney Opera House**, **Burj Khalifa** with its
  spiralling setbacks, **Christ the Redeemer**, the **Taj Mahal**, the
  **Sagrada Família**, and a capitol. Twelve destinations place them at their
  real offsets from the city centre — go to San Francisco and the bridge is
  across the bay from the Salesforce Tower; go to Tokyo and Fuji is on the
  horizon behind the Skytree. The landmark the intel panel names is the one
  wired to the strike and BDA path, and the rest topple too.
- **Sandbox exploration** — `◎ EXPLORE` (or **F**) drops you off the table and
  into the world: WASD to fly, Q/E for altitude, Shift to boost, drag to look,
  Esc to return. Terrain collision keeps you above ground.
- **Sat-uplink window** — a live top-down orbital camera feed that tracks
  whatever you target (concept stand-in for **Google Maps Platform
  Photorealistic 3D Tiles** streaming).
- **Target designation** — tap terrain: lat/lon, MGRS-style grid, elevation,
  sector ROE. Reticle with rotating outer ring and sky-beam.
- **Multi-strike salvos** — flip `MULTI` on and designate up to **4 aim
  points**, each with its own secondary reticle. EXECUTE becomes `×4` and
  fires a staggered salvo, with per-target BDA reported by grid reference.
- **Arsenal (all Lockheed families)**
  1. `JASSM-ER` standoff cruise missile — bezier flight path, particle trail, fireball, shockwave, scorch decal, camera shake
  2. `VECTIS` UCAV — Skunk Works loyal-wingman ingress + JAGM release
  3. `C-130J` airdrop — pallet, chute, landing beacon
  4. `PATHFINDER` recon team — 4-man insert + Stalker VXE scan rings
  5. `SUNDOWN` — strategic full-theater leveling (see below)
- **Team Ops** — once Pathfinder is on the ground, a command panel appears:
  **MOVE** (tap anywhere and the squad walks the terrain to that waypoint,
  distance counting down), **HOLD** overwatch, **SWEEP** (break formation into
  a rotating ISR orbit), **EXFIL** (lift out).
- **Debris physics** — pooled rigid bodies with gravity, restitution, ground
  friction and settling. Buildings shed **concrete, structural steel and glass
  shards**; survivors just outside the lethal ring lose their glazing to
  overpressure and the log reports it.
- **Destructible world** — strikes carve persistent craters into the terrain
  itself (the mountain range deforms, city blocks get holes blown in them),
  buildings collapse to rubble stubs with debris bursts, farmsteads flatten,
  trees inside the blast radius are erased, and water impacts splash instead.
  The **State Capitol is destructible** — topple it and the dome goes dark.
- **Military model library** — every vehicle is authored in **real metres** and
  converted once, so a soldier beside a Humvee beside an Abrams is correct by
  construction. Sloped Abrams glacis and 5.3 m gun, Bradley's offset turret and
  TOW box, the M109's fume extractor and muzzle brake, the Stryker's 2+2 axle
  grouping and slat armour, Apache tandem stepped cockpit and chin turret.
  Infantry in standing / kneeling / prone with helmet, plate carrier, ruck and
  rifle — kit bulk and the no-neck helmet line are what separate them from
  civilians at range.
- **Houses** with gable roofs, doors, door steps, window bays and chimneys;
  desert sites get flat parapet roofs instead.
- **A real road network.** `js/roadnet.js` emits a directed graph — arterials
  and streets, two-phase signals at four-way crossings, bridges where a road
  crosses water, left-hand traffic in the countries that drive on it — laid out
  per layout archetype on each city's real grid bearing. The street ribbon you
  see, the canvas overlay and the lanes the traffic drives are all generated
  from the **same nodes**, and the grid sits on the half-offsets of the same
  block step the buildings use, so streets run *between* blocks. A building
  that would stand in a carriageway is vetoed.
- **Pattern-of-life simulation, in 3D** — 120 pedestrians on a real walk cycle,
  68 vehicles as **real vehicle geometry** (sedan, SUV, pickup and bus, each
  extruded from a true side profile: sloped hood, raked windshield, set-back
  cabin, headlights and tail lights), antlered quadruped wildlife, and bird
  flocks. Everything is instanced — the entire population is a handful of draw
  calls. Everything scatters from a blast; traffic halts.
  - **Pedestrians are articulated.** Five instanced parts share one instance
    index — torso, two legs, two arms — each authored with its pivot at the
    origin. Gait phase advances with **distance travelled, not the clock**, so
    stride scales with speed and someone who stops actually stands still. They
    walk at 1.2–1.6 m/s, take the sidewalk when there is one, turn toward a
    heading rather than snapping to it, and pause.
  - **Wheels turn.** Four instanced wheels per car, axle along the local Z,
    rolled off the distance actually covered and steered off the curvature of
    the path. Cars accelerate to a cruise, brake into turns, hold at a red and
    choose a turn at each junction.
- **Casualty model** — tracks inside the inner blast radius are killed: they
  flash red, are thrown outward, and stay down. The log reports CIV and FAUNA
  counts as a training metric.
- **SUNDOWN** — the full-theater option. Five-second high arc, screen
  whiteout, rising mushroom column, then the land itself morphs: mountains
  flatten, city and fields level, every structure collapses, flora and water
  burn away, birds fade out, and the shader shifts to an ash palette.
  Deployed teams report signal lost. The status ticker switches to
  "no life signs detected."
- **Living landscape** — Chatfield Reservoir with animated ripples, 760
  conifers/cottonwoods, 900 bushes, 700 grass tufts, riparian corridors, farm
  windbreaks, 10 farmsteads (house + barn + silo), crop-row fields, and
  center-pivot irrigation arms that physically sweep their circles.
- **Ambient life (Sims/SimCity-inspired)** — tower windows flicker, floating
  markers track selected civilians, and a status ticker keeps reporting on the
  theater between strikes: power load, traffic flow, herd activity, soil
  moisture, weather.
- **Live sector intel** — the intel panel counts the real world, not a script:
  structures standing, civilian tracks alive, vehicles moving, herd size, tree
  line. Watch it fall (341 → 193 → 0) as you work, with landmark lock flipping
  to "LANDMARK LOST" and ROE switching when there's nothing left to protect.
- **Mission log** with military brevity codes, dual-key authorize flow,
  EXECUTE button, keyboard shortcuts (1–5, Space, Esc).
- **Built for a phone.** Every toolbar control is an inline SVG icon plus a
  word — no meaning is carried by a font glyph, and nothing is under a 44 px
  tap target. **HIDE HUD** collapses the whole interface for a full-screen
  hologram (91% of the screen), and any panel folds by tapping its title.
- **⟲ RESET** restores the entire simulation to pristine state.
- **Two hologram palettes** — MK-II Cyan (ops) and MK-I Amber (the garage).
- **Cinematic mode** — a scripted end-to-end demo run for walk-in showings
  (`▶ CINEMATIC` button, or open with `?autodemo`). Press again to stop. The
  reel waits on simulation *state* between legs — weapon clear, team on the
  ground — rather than on fixed timers, so it does not desynchronise and start
  dropping legs on a slower machine.
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
| `?site=tokyo` | boot straight into a named theater (any atlas id) |

Hotkeys: **G** theater console · **B** battle · **H** holo/real · **P** crew POV ·
**[** **]** cycle crew · **F** sandbox · **1–5** arsenal · **Space** execute · **Esc** clear

Build the self-contained single-file version (three.js inlined, for hosting
as an artifact / kiosk page):

```
node tools/build-artifact.mjs dist/artifact.html
```

## Demo script (3 minutes)

1. Let it boot — the uplink handshake sets the story (Meta HUD paired, mesh
   lock, pattern-of-life fused).
2. **Open the theater console (G).** Type "hong kong" — it loads in two
   seconds. Then "paris". The skylines are visibly different because the height
   model is real: a flat Haussmann cap versus a wall of towers.
3. Pinch/drag the theater. Point out the traffic, the pedestrians, the wildlife.
   Hit `◎ EXPLORE` and fly down to street level.
3. Tap downtown, arm `JASSM-ER`, EXECUTE — watch the strike land **and** watch
   it live in the sat window. Crater, collapse, civilians scattering.
4. Flip `MULTI` on, tap four city blocks, EXECUTE ×4 — a staggered salvo.
5. Tap the agri-belt, drop a `C-130J` resupply — "same interface, humanitarian
   tasking."
6. Insert `PATHFINDER` on the ridgeline, then drive them with Team Ops: SWEEP,
   then MOVE to a new waypoint and watch them walk it.
7. **Press H.** The hologram becomes a lit world — same scene, same sim, one
   toggle. Press it again to go back.
8. **Press B**, let the two forces make contact, then press `]`. You are in a
   tank commander's hatch. Press `]` again for a sniper's hide, again for an
   Apache cockpit. Esc returns to the table.
9. Toggle MK-I Amber. If the room wants the big one: `SUNDOWN`, then ⟲ RESET.
   Book the meeting.

## Production integration path

| Demo stand-in | Production system |
|---|---|
| Procedural holo terrain | Google Maps Platform **Photorealistic 3D Tiles** / Google Earth Engine imagery |
| Sat-uplink window | Live GEOINT feed (commercial EO constellation tasking) |
| Browser + touch | **Meta Wearables Device Access Toolkit** — display HUD + EMG wristband gestures |
| WebAudio/Vibration haptics | Native wristband haptic channel |
| Notional asset animations | C2 sandbox integration (training/wargaming only) |
| Scripted pattern-of-life | Fused ISR / ADS-B / commercial pattern-of-life feeds |

## Stack

`index.html` plus thirteen plain scripts in `js/` (no bundler, no modules, so it
still opens straight from `file://`):

| File | Role |
|---|---|
| `js/atlas.js` | generated — 51 sites with real elevation + styling |
| `js/world.js` | terrain, water and city generation from a site record |
| `js/models.js` | procedural vehicle / person / animal geometry |
| `js/physics.js` | pooled rigid-body debris |
| `js/models-mil.js` | armour, artillery, rotary-wing, infantry, houses |
| `js/battle.js` | force-on-force simulation |
| `js/landmarks.js` | 18 real-world landmark models + per-site placements |
| `js/roadnet.js` | the road network — graph, ribbon mesh and canvas, one source |
| `js/anim.js` | articulated rigs and the distance-driven walk cycle |
| `js/battlefx.js` | pooled dust, smoke and sparks for the battle |
| `js/viewmodels.js` | first-person weapons for the crew POV |
| `js/rendermode.js` | the holo/real material authority |
| `js/console.js` | worldwide theater search |

Three.js r128 vendored in `vendor/`. No other dependencies and no network
calls at runtime — it runs air-gapped.

### Regenerating the world data

```
node tools/fetch-world-data.mjs     # real elevation grids (needs network)
node tools/build-atlas.mjs          # fuse coords + elevation + styling
```

### On "maps integration"

The shipped demo has **no runtime network access** — the artifact CSP blocks it
and the repo convention is air-gap-friendly. So the map data is *real but
baked*: genuine coordinates and genuine sampled elevation, fetched once at
build time. The live-tile path (Google Photorealistic 3D Tiles streamed against
the same coordinates) is the production upgrade in the table above, not
something this demo fakes.

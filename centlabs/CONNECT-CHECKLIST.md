# CentLabs — Connect Everything: what I need from you

The division of labor: **you create the accounts, do the physical/on-device
steps, and hand me the non-secret config. I write and wire the software.**

**Secrets rule (non-negotiable):** never paste an API key, token, or password
into the repo or a chat. Set them as environment variables on the machine, the
way each README shows. When you "give me" a credential below, it means *set it
in the env yourself* — I only need to know it exists and its variable name.

Work top to bottom. Each block says what only you can do, what to hand me, and
what I do with it.

---

## 0. One decision (unblocks the glasses)

- [ ] **Glasses build path:** the fast **web-app path** (reuse the JARVIS/Spotter
  HUDs we already have — something on-glass soonest) **or** the full **native
  iOS bridge** (more work, full camera + audio + display). Just say which.

---

## 1. Accounts to create (you)

- [ ] **Tailscale** — free. The mesh that makes every device feel plugged into
  Node 001. (No secret to hand me; you log each device in.)
- [ ] **Meta Developer** account, then **join the Wearables Device Access
  Toolkit developer preview** at `wearables.developer.meta.com`. Create an app
  → this mints the four IDs I need (see §5).
- [ ] **Apple Developer** account ($99/yr) — needed to install the bridge app
  onto the iPhone 14 test device without it expiring every 7 days.
- [ ] *(optional)* **ElevenLabs** — for the cinematic JARVIS voice instead of
  the system voice. Free tier is fine to start.
- [ ] *(optional, for voice power-on)* **Home Assistant** (best, local) *or*
  just an **Alexa** routine — pick one; see §4.

---

## 2. Node 001 — the brain (you, at the machine)

- [ ] Install **Docker Desktop + WSL2 + the NVIDIA Container Toolkit** so the
  RTX reaches containers. (I give you the exact commands + a verify step.)
- [ ] Run **`jarvisd/install/windows/enable-wol.ps1`** as admin, then set the
  **BIOS** toggles it prints (ErP Ready → off, Power On By PCIe → on, disable
  Deep Sleep). This is the voice-power-on half only you can do.
- [ ] **Note the wired Ethernet MAC address** and your **LAN subnet** (e.g.
  `192.168.1.0/24`) — hand me both (not secret).
- [ ] Install Python, `pip install -r jarvisd/requirements.txt`, run
  **`install-jarvisd.ps1`**, and turn **mic permission** on
  (Settings → Privacy → Microphone, incl. "let desktop apps access…").

## 3. MacBook Air (you)

- [ ] Install **Tailscale** and log in.
- [ ] Install the JARVIS daemon LaunchAgent (`jarvisd/install/macos/…`), edit the
  two paths, and **approve the mic prompt** on first run.
- [ ] Install **Claude Code** (already have it) — Remote-SSH into Node 001 comes
  once Tailscale is up.

## 4. Voice power-on (Alexa → PC) — pick one (you)

- [ ] **Home Assistant path** (recommended): install HA on Node 001 or a Pi, add
  the `wake_on_lan` integration, expose it to Alexa (Nabu Casa or local
  `emulated_hue`). "Alexa, turn on the PC" → magic packet.
- [ ] **jarvisd bridge path** (no HA): run `python3 -m jarvisd.wol serve` on any
  always-on wired device, set `JARVIS_WOL_TARGETS` + `JARVIS_WOL_TOKEN`, and
  point an Alexa routine or iPhone Shortcut at `POST /wake/node001`.

## 5. Meta glasses (you → then me)

- [ ] Pair the **Ray-Ban Display to the Meta AI app** on your iPhone 16 (Meta owns
  this layer; nothing I can do for you here).
- [ ] From your Meta app, hand me the four IDs (set them in the app's config, not
  the repo): **`MetaAppID`**, **`ClientToken`**, **`TeamID`**,
  **`AppLinkURLScheme`**.
- [ ] iPhone 14: get the screen working **once** (temporary repair/known-good
  display) to unlock, back up to the Mac, enroll on Tailscale — per
  `MOBILE-NODE.md`. After that it's headless.

## 6. iPhone 14 test device (you)

- [ ] Wipe it, sign in with a **secondary Apple ID**, install Tailscale
  ("connect on demand"), pair to the MacBook. Then I can deploy the bridge to it.

---

## What to hand me (all non-secret)

| Item | Example | Used for |
|---|---|---|
| Node 001 wired MAC | `AA:BB:CC:DD:EE:FF` | Wake-on-LAN target |
| LAN subnet / broadcast | `192.168.1.0/24` → `.255` | WoL + Tailscale routes |
| Device names on Tailscale | `node001`, `air`, `iphone16`, `iphone14` | wiring the bridge |
| Meta four IDs (once in preview) | from the Meta app | the glasses bridge app |
| Glasses path choice | "web app" / "native iOS" | what I build first |

**Secrets you set yourself as env vars** (I never see or store them): the
ElevenLabs key + voice ID, your Anthropic API key (for routing to Claude), and
any other model keys later.

---

## What I do once you hand me each piece

- The **Node 001 Compose data plane** (Ollama, Postgres, Qdrant, Redis, Caddy) —
  I can write this **now**, no input needed; you just `make up` after Docker's in.
- **Hermes v0** — the one `/ask` + `/memory` + model-router endpoint on Node 001.
- The **glasses bridge** — the app (web or native) that forwards the glasses'
  camera/audio to Hermes/`jarvisd` over Tailscale and renders the Spotter HUD
  contract + JARVIS brief back onto the display.
- Wiring **`jarvisd` ↔ Node 001**, memory indexing of this repo first, and the
  model-routing rules.

**Nothing here needs your Meta/Apple accounts to start** — I can build the Node
001 data plane and the glasses-bridge scaffold today, so the only thing waiting
on you is accounts + physical steps.

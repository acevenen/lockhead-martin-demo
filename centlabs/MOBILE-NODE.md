# CentLabs Mobile Node — iPhone 14 (headless)

The iPhone 14 has a nonfunctional display. It is not a phone anymore; it is a
**permanently-powered, mostly-headless mobile sensor and relay node** on the
CentLabs tailnet. Nothing here assumes you can see or touch the screen in normal
operation.

> **Design rule:** all durable processing, storage, scheduling, model inference,
> and orchestration live on **Node 001**. iOS actively kills unattended
> background work, so fighting it is a losing game. The phone's only jobs are:
> **collect inputs, receive events, execute permitted mobile actions, relay.**
> Everything it gathers is pushed to Node 001; everything it does is triggered
> from Node 001. If you find yourself wanting the phone to "run" something
> continuously, that logic belongs on the Node.

---

## One-time setup (display temporarily needed)

The screen has to work **once** to bootstrap. Plan on a temporary repair or a
borrowed known-good display/digitizer, or an MFi controller/keyboard via the
Lightning port with VoiceOver, long enough to:

1. Unlock and **back up to the MacBook** (encrypted local backup — never iCloud
   for this device).
2. **Wipe to a clean slate.** This device holds nothing personal.
3. Sign in with a **secondary Apple ID** dedicated to CentLabs — not your primary.
4. **Pair with the MacBook** (trust prompt) so you can drive it headless later via
   Xcode / `devicectl` / `libimobiledevice`.
5. Install **Tailscale** and join the tailnet; enable **"Connect on demand"** so
   it re-joins after every reboot with no interaction.
6. Enable **Guided Access** or a Shortcuts automation set so the device returns to
   a known state on boot.
7. Set **Settings > Display > Auto-Lock = Never**, disable **Automatic Updates**
   (an OS update can break pairing, signing, and any jailbreak — see recovery),
   and set it to **stay awake on power**.

Once enrolled it runs headless; you only need the screen again for the recovery
cases below.

## What it does (all touch-free)

Driven by **Shortcuts Personal Automations** (time-, location-, NFC-, Bluetooth-,
charger-, and push-triggered — none need the screen), Hermes push commands, and
the MacBook over USB/Tailscale:

- mobile **API testing** against Hermes and staging builds
- **push-notification** delivery testing
- **automation triggers** (arrive/leave, connect/disconnect, charger, NFC tag)
- **BLE** scanning and beacon experiments
- **Wi-Fi / cellular** network testing and reachability probes
- **Meta Ray-Ban companion** experiments
- **staging / TestFlight** builds and mobile-client **health checks**
- **secondary Apple ID** testing
- **sensor collection** (motion, location, ambient) → posted to Node 001
- **camera / microphone** experiments **with explicit consent**, captured on
  demand and relayed, never continuously
- **Hermes command relaying** and **Sentinel telemetry** collection
- home-lab automation triggers

Communication is **Tailscale + authenticated APIs only** — the phone talks to
Node 001, never to the open internet, and holds a per-device token it can present
but that can be revoked centrally.

## Data hygiene (hard rules)

**Never** on this device: personal photos, messages, financial accounts,
production credentials, or any sensitive data. It carries only what it needs to
test and relay, and a leaked or lost node should cost nothing but a token
rotation and a re-enroll.

## Resilience

Design every service so the device can **reboot and reconnect with minimal
manual intervention**: Tailscale "connect on demand" rejoins the mesh; a boot-time
Shortcuts automation re-registers with Hermes and resumes its health-check
heartbeat; tokens are long-lived but revocable; nothing depends on a human
tapping the (dead) screen.

---

## Jailbreak — optional research mode, never a dependency

If a reputable jailbreak supports this phone's **exact** iOS version, treat it as
an **optional research mode**, not core infrastructure. **Do not build the
architecture around jailbreak persistence** — it must all still work if the
jailbreak breaks on the next reboot or update. That's why durable logic lives on
Node 001, not here.

In jailbroken research mode, restrict experimentation to:

- inspecting **this device's own** filesystem and logs
- testing software **you own or are authorized to test**
- studying sandbox and entitlement behavior
- prototyping local services
- UI and system customization
- deeper automation
- security validation of **CentLabs's own** mobile clients

Nothing here touches software you don't own or systems you aren't authorized to
test.

---

## Recovery runbook

Each scenario, and the fix — written for a device whose screen may be dead.

| Scenario | Recovery |
|---|---|
| **Lost pairing** | Re-pair from the MacBook (`idevicepair pair` / Xcode Devices). If the trust prompt is required and the screen is dead, that is the one case needing a temporary display. Keep the pairing record backed up so you rarely hit this. |
| **Failed boot / boot loop** | Enter Recovery/DFU via button combo (no screen needed) and restore the last **encrypted MacBook backup**; it re-enrolls automatically on first boot. |
| **Networking failure** | Tailscale "connect on demand" self-heals on reboot. If the tailnet key expired, re-auth from the admin console (revoke + re-issue a key) and reboot the device. |
| **Expired signing** (sideloaded builds stop launching after 7 days) | Use a longer-lived signing path — a paid Apple Developer account (1-year) or TestFlight — so re-signing is rare; re-deploy from the MacBook when it lapses. Assume it will lapse; don't depend on any sideloaded app being up. |
| **Jailbreak loss** (after update/reboot) | Expected, not an incident. The core system keeps working because nothing durable ran on the jailbreak. Re-apply only if you're actively in research mode. |
| **Battery degradation** (always-on aging) | Run on power with a **charge limit** (Shortcuts automation to stop charging ~80% where supported, or an external smart plug cycling power) to slow wear; plan for battery replacement as routine maintenance, not failure. |
| **Thermal issues** | Keep it ventilated and out of sun; a boot automation throttles or pauses camera/sensor capture above a temperature the device reports; sustained heat → power-cycle via smart plug. |
| **Accidental update** | Automatic Updates are OFF by design. If one slips through and breaks pairing/signing/jailbreak, treat it as "failed boot": restore the known-good encrypted backup. |
| **Device replacement** | Because the phone holds no unique state — the brain is Node 001 — replacement is: wipe the new device, restore the enrollment backup or re-run one-time setup, issue a fresh token, revoke the old one. Minutes, not migration. |

**The through-line:** the node is disposable by design. Every recovery path ends
in "re-enroll and rotate a token," because the intelligence, the data, and the
schedules were never on the phone.

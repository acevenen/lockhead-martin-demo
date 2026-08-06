# CentLabs Workspace v1

My personal AI operating system — one brain, on **CentLabs Node 001**, reachable
from every device I own.

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the full system: device topology, the
  stack, all ten phases as decisions with WHY and tradeoffs, the container-runtime
  analysis, where Sentinel / Spotter / RORY already slot in, and the build
  order to follow.
- **[CONNECT-CHECKLIST.md](CONNECT-CHECKLIST.md)** — exactly what I need from
  you (accounts, physical steps, config) to connect everything, in order.
- **[MOBILE-NODE.md](MOBILE-NODE.md)** — the iPhone 14 headless sensor/relay node
  and the full recovery runbook.
- **[GLASSES-BRIDGE.md](GLASSES-BRIDGE.md)** — how RORY/Spotter reach the Meta
  Ray-Ban Display: the web-app path (built), the native path (next), and what's
  gated on you. The relay itself lives in [`bridge/`](bridge/README.md); the
  Node 001 data plane it runs behind is in [`node001/`](node001/).

**The thesis:** the intelligence lives on Node 001; the MacBook, phones, and
Ray-Bans are interfaces into it. Local-first where practical, cloud-assisted when
beneficial, secure and reproducible everywhere. Optimize for the environment I'll
still be using five years from now.

**Already built and slotting in:** Sentinel (security + audit), Spotter (device
intelligence for the glasses), the RORY HUD (seed of the Control Center), and
`roryd` (the always-on voice daemon — morning brief, wake word, and Node 001
power-on). See [`roryd/`](../roryd/README.md).

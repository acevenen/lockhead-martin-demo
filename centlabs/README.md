# CentLabs Workspace v1

My personal AI operating system — one brain, on **CentLabs Node 001**, reachable
from every device I own.

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the full system: device topology, the
  stack, all ten phases as decisions with WHY and tradeoffs, the container-runtime
  analysis, where Sentinel / Spotter / JARVIS already slot in, and the build
  order to follow.
- **[CONNECT-CHECKLIST.md](CONNECT-CHECKLIST.md)** — exactly what I need from
  you (accounts, physical steps, config) to connect everything, in order.
- **[MOBILE-NODE.md](MOBILE-NODE.md)** — the iPhone 14 headless sensor/relay node
  and the full recovery runbook.

**The thesis:** the intelligence lives on Node 001; the MacBook, phones, and
Ray-Bans are interfaces into it. Local-first where practical, cloud-assisted when
beneficial, secure and reproducible everywhere. Optimize for the environment I'll
still be using five years from now.

**Already built and slotting in:** Sentinel (security + audit), Spotter (device
intelligence for the glasses), the JARVIS HUD (seed of the Control Center), and
`jarvisd` (the always-on voice daemon — morning brief, wake word, and Node 001
power-on). See [`jarvisd/`](../jarvisd/README.md).

# Hermes capability inventory (discovery required)

Hermes is **not integrated**. No capability is assumed. Its manifest
(`jarvis/brain/agents/registry/hermes.json`) is a placeholder with status
`discovery_required`, zero capabilities, zero tools, and every task routed to
`blocked` pending this inventory. Integration happens through a capability
**adapter** only after the answers below are known.

## Please answer (owner / Hermes docs)
| Question | Answer |
|---|---|
| Available tools | unknown |
| Supported channels | unknown |
| Memory model | unknown |
| Scheduling | unknown |
| Browser / computer control | unknown |
| Filesystem access | unknown |
| Communications (email/chat/etc.) | unknown |
| Integrations | unknown |
| Authentication | unknown |
| API or CLI | unknown |
| Webhooks | unknown |
| Permission model | unknown |
| Deployment model | unknown |
| Failure behavior | unknown |
| Rate & cost limits | unknown |

## Adapter interface (to implement once known)
A thin adapter with four methods, mirroring the provider-boundary pattern:
- `submit(task)` — hand a bounded task to Hermes.
- `status(ref)` — poll/subscribe to progress.
- `results(ref)` — retrieve output as artifacts (registered with provenance).
- `ingestEvents(...)` — fold Hermes events into the append-only ledger.

Until implemented, **do not build guessed integrations**. Any Hermes task stays
`blocked` with the reason "capability inventory required."

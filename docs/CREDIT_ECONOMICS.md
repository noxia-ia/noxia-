# NOXIA Phase 1 — Credit Economics

`src/lib/generation-costs.ts` is the single application-level source of truth for NOXIA credit costs.

| Capability | NOXIA cost |
|---|---:|
| Code / lightweight operation | 1 |
| Image | 2 per delivered image |
| Video | 5 per 5 seconds (5s=5, 10s=10, 15s=15; 30s=30) |
| Music | 3 per 15 seconds (15s=3, 30s=6, 60s=12, 120s=24) |
| ASMR video | same duration pricing as Video |
| ASMR audio/image legacy modes | 1 |
| Agent response | 1 |
| TTS | 1 per 1,000 characters, minimum 1 |
| STT | 1 per 30 seconds when an authoritative duration is available; the current upload pipeline reserves the minimum 1 because it does not expose trusted server-side duration metadata |

These are internal NOXIA credits. Provider billing is deliberately separate.

`create_generation()` now validates the requested reservation against the central cost calculation before calling the atomic SQL reservation. This prevents a caller from choosing an arbitrary credit amount.

Agents use their dedicated atomic reservation path and validate the central agent cost as well.

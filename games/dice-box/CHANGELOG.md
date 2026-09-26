# Development history

| Date / time (Berlin) | Source commit | Milestone |
| --- | --- | --- |
| 26 September 2026, 10:42 | `bfceb7fa619398e0e2cbbd0941dd58d1819013f9` | Prototype v0.1 |

## Prototype v0.1 — 25–26 September 2026

Up to five sharp-edged 16 mm dice in a 66 × 140 × 36 mm glass box with a felt floor. The phone is the box: effective gravity is the negative of the measured specific force, and rotation adds Euler, centrifugal and Coriolis terms. The gravity sign is measured at start rather than looked up per platform. Sequential-impulse contact solver at 480 Hz with speculative contacts, sleep and wake. three.js rendering, synthesized impact sounds, an in-page fairness test (χ² over pooled faces) and a drag/Space fallback without sensors. Fourteen headless engine checks pass. Real-phone testing is outstanding; see `docs/model-notes-v0.1.md`.

## Game Labs — 26 September 2026

Imported into Game Labs at `games/dice-box/`. The import commit above contains the prototype's files byte for byte, and GitHub Pages publishes it as the first development stage. Added afterwards: `package.json` (so `npm test` at the repository root runs the engine checks), `stages.json`, this changelog, a Game Labs pointer in the README, and one correction in the model notes: three.js is vendored, not loaded from cdnjs. The vendored file is identical to the official r128 build. No game code changed.

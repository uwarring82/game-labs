# Development history

| Date / time (Berlin) | Source commit | Milestone |
| --- | --- | --- |
| 26 September 2026, 10:42 | `bfceb7fa619398e0e2cbbd0941dd58d1819013f9` | Prototype v0.1 |
| 26 September 2026, 11:55 | `442729e343593c176ac2dadf87ebee9bf4cbc9d6` | Realistic dice, a loaded die, breakable glass |

## Prototype v0.1 — 25–26 September 2026

Up to five sharp-edged 16 mm dice in a 66 × 140 × 36 mm glass box with a felt floor. The phone is the box: effective gravity is the negative of the measured specific force, and rotation adds Euler, centrifugal and Coriolis terms. The gravity sign is measured at start rather than looked up per platform. Sequential-impulse contact solver at 480 Hz with speculative contacts, sleep and wake. three.js rendering, synthesized impact sounds, an in-page fairness test (χ² over pooled faces) and a drag/Space fallback without sensors. Fourteen headless engine checks pass. Real-phone testing is outstanding; see `docs/model-notes-v0.1.md`.

## Game Labs — 26 September 2026

Imported into Game Labs at `games/dice-box/`. The import commit above contains the prototype's files byte for byte, and GitHub Pages publishes it as the first development stage. Added afterwards: `package.json` (so `npm test` at the repository root runs the engine checks), `stages.json`, this changelog, a Game Labs pointer in the README, and one correction in the model notes: three.js is vendored, not loaded from cdnjs. The vendored file is identical to the official r128 build. No game code changed.

## Realistic dice, a loaded die, breakable glass — 26 September 2026

**Rendering.** Dice have round edges (the arcs are sampled evenly in angle) and drilled, painted pips: spherical dimples in a generated normal map that the clear coat follows too. Each die has its own colour (ivory, red, blue, amber, black), repeated in the result readout and the fairness table, so every die can be told apart. The glass now uses transmission and has no diffuse colour. The previous two 13 %-opaque light shells had washed out the dice and the felt. The studio light panel moved to the lamp's direction, so top faces seen from above no longer mirror it. One mesh per die replaces 22.

**Loaded die.** Setup can load any one die towards any face, from fair to heavily loaded. The model is a dense plate under the opposite face with total mass unchanged: a shifted centre of mass, the matching inertia tensor, and the torque-free precession term in the box frame. Measured in 400 throws, a die favouring 6 shows it 22, 29, 36 and 40 % of the time at the four quarter settings (fair: 16.7 %). The fair dice in the same box stay fair. The in-page fairness test reports each die separately.

**Breakable glass.** The box shatters when the measured acceleration (accelerometer magnitude, gravity included) stays above a limit for 25 ms. The limit is set in Setup: 2 to 12.5 g or unbreakable, default 8 g, above the on-screen Shake's peak; Setup shows the strongest shake so far. Lid and walls leave the physics, the felt becomes a finite pad, and dice can slide or fly off it. Glass shards fly and fall under the same box-frame gravity, with a crash sound. "New box" restores the glass. This is a game rule, not a fracture model.

**Checks.** Five new engine checks (19 in total). With zero load the engine is identical bit for bit, and the original 14 checks print identical output. A loaded die precesses like the analytic torque-free top (0.06°; a uniform cube would be 17° off). A shattered box keeps its dice while level and spills them at 30°. A loaded die shows clear bias while the others stay fair.

**Fixes.** A frame could start before the tap that began a synthetic shake, which gave the shake a negative time and a script error for that frame. The model notes are now `docs/model-notes.md` (v0.2). Real-phone testing is still pending.

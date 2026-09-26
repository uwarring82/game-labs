# Development history

This record summarizes the development in the Marble Lab conversation. The six original source commits are preserved; their generic commit messages have not been rewritten. Dates below are normalized to Europe/Berlin. Milestone names are descriptive, not endorsed releases. This is a development summary, not a verbatim chat transcript.

| Date / time (Berlin) | Source commit | Milestone |
| --- | --- | --- |
| 25 September 2026, 17:54 | `b89157084a741a984640a33b799ba7664cb23aab` | Initial tilt maze |
| 25 September 2026, 18:31 | `4f8ae65448826abe7d5612a3131601af7bdbc02f` | Material physics |
| 25 September 2026, 19:06 | `3b37b4141c75175e530f03306e058480bad9f9f5` | Expanded material combinations |
| 25 September 2026, 19:32 | `54809a89744c4e75db3b70ea43d8f13b46fb00d8` | Screen space, look and sound |
| 25 September 2026, 20:39 | `13568f21749b6e01be77e9b194b6fbe31719d3ad` | Terrain dynamics and open edges |
| 25 September 2026, 22:17 | `cb911113a7319285f88ae9508359cb9d87630180` | Relief v0.1 draft |

## Initial tilt maze

A browser application with one top-down maze, phone orientation, pitched-neutral calibration, touch/keyboard acceleration control, fixed physics stepping, pause/resume handling and sensor diagnostics. No dedicated native app. Real momentum and counter-tilt braking are the control model.

## Material physics

Physical ball dimensions, mass and inertia; contact friction, rolling losses, restitution and spin. Steel and rubber respond differently on wood and sand. Parameters are scenario assumptions with documented sources and limits, rather than user-facing physics sliders. Hole capture and rim contact depend on motion and geometry.

## Expanded material combinations

Ice introduces slipping and re-grip. Table-tennis balls add shell inertia and visible drag. Cork supplies the low-rebound corner. Billiard/baize provides literature reference coefficients. Wall material is independent of floor material. Parameter tables and material-route regressions accompany the additions. A thin oil film was discussed but remains deferred.

## Screen space, look and sound

Portrait board units, uniform scaling, safe areas, capped pixel density, dynamic viewport handling, standalone manifest and icons, fullscreen/orientation handling where available. Cached procedural surfaces, spin marks, height/shadows and persistent surface marks. Web Audio rolling and impulse-driven impacts, optional haptics, and diagnostics for timing. Platform behavior still requires real-device checks.

## Terrain dynamics and open edges

A smooth heightfield adds slope and curvature to the contact model. Crests can launch the ball; landing reuses friction and restitution. The summit requires three seconds of dwell. Open edges removes perimeter walls and permits a physical fall. Point terrain was the predecessor of the full-board Relief landscape.

## Relief v0.1 — draft, unendorsed

Continuous Gaussian/warped landscape with hillshade and contours; drainage holes; four route passes; curved low/tall walls; a confinement pocket; sandy pothole; resin patch; and a goal summit with a 0.7 s lossless e-folding reference. Measured linear acceleration comes from orientation-derived gravity subtraction, with held samples, a 3g cap, and calibrated-frame alignment. Full motion has no gesture, shake, toss or stuck-state detector.

The generator and tilt-budget bot reject unsuitable candidates, including a deliberately blocked handmade level. Recorded acceptance: 93 automated checks; 10/10 route trials for each of five balls on wood at an 8° budget. Trials perturb initial positions; they do not establish human or noisy-phone reliability. Both physical-phone measurements remain pending.

The finite-stop calculation was corrected: a 0.4 m/s flick followed by a uniform 30 ms stop produces about 2.15 mm separation, not the 8.15 mm instantaneous-stop value. The route bot uses a stronger documented waveform. Observed accelerometer peaks are not hardware range measurements.

## Repository preparation — 26 September 2026

Added this readable development record, design decisions, acceptance checklist and contribution instructions. Game code and the published Site are unchanged by this documentation step. A GitHub repository has not yet been created at preparation time.

## Game Labs — 26 September 2026

Moved into the public Game Labs repository at `games/marble-lab/`. The seven earlier commits were imported unchanged, so the commit IDs above still resolve. GitHub Pages now publishes the current build and each milestone above as a playable development stage, extracted from these commits (`stages.json`).

The web-app manifest's `id`, `start_url` and `scope` are now `./` instead of `/`, so the game also runs under a subpath such as GitHub Pages. At a site root the two are equivalent. No game code changed. Both physical-phone measurements remain pending.

## iPhone gravity sign — 26 September 2026

The first real-phone test (iPhone, Safari) showed full motion reading about −2g upward at rest, which threw the ball off the board. Cause: the W3C specification and Android report `accelerationIncludingGravity` as +g along the upward screen normal, but WebKit passes Core Motion's opposite sign through unchanged, so every iPhone browser reports all three axes reversed. The game subtracted spec-convention gravity, doubling it instead of removing it. Tilt only was unaffected.

Calibration now measures the convention. During the hold-still window, the mean reading is compared with the gravity predicted from β/γ. A match within 0.1g directly or negated sets the sign for later samples. Anything else, or no readings, turns full motion off with an explanation, and tilt-only continues to work. Diagnostics show the detected sign and the rest residual, and motion exports (schema v0.2) include both. Three new tests cover the check, both conventions at four screen rotations, and 30 samples from the recorded iPhone export (rest residual below 0.1 m/s² after correction). Physical-phone acceptance remains pending.
